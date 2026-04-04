// src/telegram/providers/mtproto.provider.ts
//
// Dono exclusivo dos Map<string, TelegramClient>.
// Nenhum outro serviço manipula diretamente os clients do GramJS.

import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    forwardRef,
} from "@nestjs/common";
import { TelegramClient, Api } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { StringSession } from "telegram/sessions";
import bigInt from "big-integer";
import { PrismaService } from "../../prisma/prisma.service";
import { AiAgentService } from "../../modules/ai-agent/ai-agent.service";
import { MtprotoClientLogger } from "./mtproto-client.logger";

@Injectable()
export class MtprotoProvider implements OnModuleDestroy {
    private readonly logger = new Logger(MtprotoProvider.name);

    // Map principal: botId → client GramJS autenticado
    private readonly clients = new Map<string, TelegramClient>();
    private readonly chatPeers = new Map<string, any>();

    // Map temporário para o fluxo OTP (sendCode → verifyCode → verifyPassword)
    private readonly tempClients = new Map<
        string,
        { client: TelegramClient; phoneCodeHash?: string }
    >();

    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => AiAgentService))
        private readonly aiAgentService: AiAgentService,
    ) {}

    // ── Lifecycle ─────────────────────────────────────────────────────────

    async onModuleDestroy() {
        for (const [id, client] of this.clients.entries()) {
            try {
                await client.disconnect();
            } catch (e) {
                this.logger.error(`Erro ao desconectar client ${id}:`, e);
            }
        }
        this.clients.clear();
        this.chatPeers.clear();
    }

    // ── Client API ────────────────────────────────────────────────────────

    getClient(botId: string): TelegramClient | undefined {
        return this.clients.get(botId);
    }

    rememberPeer(botId: string, chatId: string, peer: any): void {
        if (!peer) {
            return;
        }

        this.chatPeers.set(this.makePeerKey(botId, chatId), peer);
    }

    async ensureClient(botId: string): Promise<TelegramClient> {
        const connectedClient = this.clients.get(botId);
        if (connectedClient?.connected) {
            return connectedClient;
        }

        if (connectedClient) {
            try {
                await connectedClient.disconnect();
            } catch (_) {}
            this.clients.delete(botId);
        }

        const bot = await this.prisma.botAccount.findUnique({
            where: { id: botId },
        });

        if (!bot) {
            throw new Error(`Bot account not found for botId=${botId}`);
        }

        await this.initClient(bot);

        const client = this.clients.get(botId);
        if (!client?.connected) {
            throw new Error(`MTProto client unavailable for botId=${botId}`);
        }

        return client;
    }

    async resolvePeer(botId: string, chatId: string): Promise<any> {
        const cacheKey = this.makePeerKey(botId, chatId);
        const cachedPeer = this.chatPeers.get(cacheKey);
        if (cachedPeer) {
            return cachedPeer;
        }

        const client = await this.ensureClient(botId);

        try {
            const peer = await client.getInputEntity(chatId);
            this.rememberPeer(botId, chatId, peer);
            return peer;
        } catch (_) {
            await this.warmPeerCacheFromDialogs(botId, client);
            const warmedPeer = this.chatPeers.get(cacheKey);
            if (warmedPeer) {
                return warmedPeer;
            }

            const peer = await client.getInputEntity(chatId);
            this.rememberPeer(botId, chatId, peer);
            return peer;
        }
    }

    hasClient(botId: string): boolean {
        return this.clients.has(botId);
    }

    makeRandomId() {
        return bigInt(Math.floor(Math.random() * 1e15).toString());
    }

    // ── Initialization ────────────────────────────────────────────────────

    async initClient(bot: {
        id: string;
        session?: string | null;
        apiId?: number | null;
        apiHash?: string | null;
        name?: string;
    }): Promise<void> {
        if (this.clients.has(bot.id)) return;

        const client = new TelegramClient(
            new StringSession(bot.session || ""),
            Number(bot.apiId),
            bot.apiHash!,
            {
                connectionRetries: 5,
                retryDelay: 2000,
                baseLogger: new MtprotoClientLogger(
                    this.logger,
                    bot.id,
                    bot.name,
                ),
            },
        );

        await client.connect();
        this.clients.set(bot.id, client);

        if (!(await client.isUserAuthorized())) {
            this.logger.warn(`Client ${bot.id} não autorizado, pulando...`);
            this.clients.delete(bot.id);
            return;
        }

        // Salva/atualiza usuário no banco ao receber mensagens MTProto
        client.addEventHandler(async (event: NewMessageEvent) => {
            const message = event.message;
            if (!message || message.out) return;

            const chatId = message.chatId?.toString();
            const sender = (await message.getSender()) as any;
            const telegramUserId = sender?.id?.toString();
            const ignoreReason = this.getIgnoredMtprotoMessageReason(
                message as any,
                sender,
                chatId,
                telegramUserId,
            );

            if (ignoreReason) {
                this.logger.debug(
                    `[MtprotoProvider] ignorando mensagem recebida botId=${bot.id} motivo=${ignoreReason}`,
                );
                return;
            }

            const safeChatId = chatId!;
            const safeTelegramUserId = telegramUserId!;
            const rawText = String((message as any).message ?? "").trim();
            let inputChat: any;

            try {
                inputChat = await (event as any).getInputChat?.();
            } catch (_) {
                inputChat = undefined;
            }

            if (inputChat) {
                this.rememberPeer(bot.id, safeChatId, inputChat);
            }

            try {
                const senderPeer = await client.getInputEntity(sender);
                this.rememberPeer(bot.id, safeChatId, senderPeer);
                this.rememberPeer(bot.id, safeTelegramUserId, senderPeer);
            } catch (_) {
                // Peer pode nao estar resolvivel neste ponto; seguimos com o inputChat.
            }

            try {
                await this.prisma.telegramUser.upsert({
                    where: { chatId: safeChatId },
                    update: {
                        lastSeenAt: new Date(),
                        username: sender.username || null,
                        firstName: sender.firstName || null,
                        lastName: sender.lastName || null,
                        botId: bot.id,
                    },
                    create: {
                        chatId: safeChatId,
                        telegramUserId: safeTelegramUserId,
                        botId: bot.id,
                        username: sender.username || null,
                        firstName: sender.firstName || null,
                        lastName: sender.lastName || null,
                        firstSeenAt: new Date(),
                        lastSeenAt: new Date(),
                    },
                });
            } catch (err) {
                this.logger.error("Erro ao salvar usuário via MTProto:", err);
            }

            if (!rawText) {
                return;
            }

            void this.aiAgentService
                .enqueueIncomingMessage({
                    transport: "mtproto",
                    botId: bot.id,
                    telegramId: safeChatId,
                    chatId: safeChatId,
                    messageText: rawText,
                    telegramMessageId: String((message as any).id ?? ""),
                })
                .catch((err) =>
                    this.logger.error(
                        `Erro ao enfileirar IA via MTProto para chatId=${safeChatId}:`,
                        err,
                    ),
                );
        }, new NewMessage({}));

        this.logger.log(
            `[MtprotoProvider] Client "${bot.name}" (${bot.id}) conectado.`,
        );
    }

    private getIgnoredMtprotoMessageReason(
        message: any,
        sender: any,
        chatId?: string,
        telegramUserId?: string,
    ): string | undefined {
        if (!chatId) {
            return "missing-chat-id";
        }

        if (!telegramUserId) {
            return "missing-sender-id";
        }

        if (sender?.bot) {
            return "sender-bot";
        }

        if (sender?.self) {
            return "self-message";
        }

        if (chatId !== telegramUserId) {
            return "chat-sender-mismatch";
        }

        const peerClass =
            message?.peerId?.className ?? message?.chat?.className ?? "";
        if (peerClass && peerClass !== "PeerUser") {
            return `peer-${peerClass}`;
        }

        if (message?.isGroup) {
            return "group";
        }

        if (message?.isChannel) {
            return "channel";
        }

        return undefined;
    }

    private makePeerKey(botId: string, chatId: string): string {
        return `${botId}__${chatId}`;
    }

    private async warmPeerCacheFromDialogs(
        botId: string,
        client: TelegramClient,
    ): Promise<void> {
        const dialogs = await client.getDialogs({ limit: 300 });

        for (const dialog of dialogs as any[]) {
            const dialogId = this.extractDialogId(dialog);
            if (!dialogId) {
                continue;
            }

            try {
                const peer = await client.getInputEntity(dialogId);
                this.rememberPeer(botId, dialogId, peer);
            } catch (_) {
                // Ignora dialogs sem peer resolvivel no momento.
            }
        }
    }

    private extractDialogId(dialog: any): string | undefined {
        const candidate =
            dialog?.id ??
            dialog?.entity?.id ??
            dialog?.dialog?.peer?.userId ??
            dialog?.dialog?.peer?.chatId ??
            dialog?.dialog?.peer?.channelId;

        if (candidate === undefined || candidate === null) {
            return undefined;
        }

        return candidate.toString();
    }

    // ── Temp clients (OTP flow) ───────────────────────────────────────────

    getTempClient(botId: string) {
        return this.tempClients.get(botId);
    }

    setTempClient(
        botId: string,
        data: { client: TelegramClient; phoneCodeHash?: string },
    ): void {
        this.tempClients.set(botId, data);
    }

    deleteTempClient(botId: string): void {
        this.tempClients.delete(botId);
    }

    async finalizeLogin(
        botId: string,
        client: TelegramClient,
    ): Promise<{ success: true; session: string }> {
        const sessionString = client.session.save() as unknown as string;

        await this.prisma.botAccount.update({
            where: { id: botId },
            data: { session: sessionString, isActive: true },
        });

        this.tempClients.delete(botId);

        const updatedBot = await this.prisma.botAccount.findUnique({
            where: { id: botId },
        });
        await this.initClient(updatedBot!);

        return { success: true, session: sessionString };
    }
}
