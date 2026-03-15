// src/telegram/providers/mtproto.provider.ts
//
// Dono exclusivo dos Map<string, TelegramClient>.
// Nenhum outro serviço manipula diretamente os clients do GramJS.

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { TelegramClient, Api } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { StringSession } from "telegram/sessions";
import bigInt from "big-integer";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class MtprotoProvider implements OnModuleDestroy {
    private readonly logger = new Logger(MtprotoProvider.name);

    // Map principal: botId → client GramJS autenticado
    private readonly clients = new Map<string, TelegramClient>();

    // Map temporário para o fluxo OTP (sendCode → verifyCode → verifyPassword)
    private readonly tempClients = new Map<
        string,
        { client: TelegramClient; phoneCodeHash?: string }
    >();

    constructor(private readonly prisma: PrismaService) {}

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
    }

    // ── Client API ────────────────────────────────────────────────────────

    getClient(botId: string): TelegramClient | undefined {
        return this.clients.get(botId);
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
            { connectionRetries: 5, retryDelay: 2000 },
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
            if (!chatId || chatId.startsWith("-")) return;

            const sender = (await message.getSender()) as any;
            const telegramUserId = sender?.id?.toString();
            if (!telegramUserId) return;

            try {
                await this.prisma.telegramUser.upsert({
                    where: { chatId },
                    update: {
                        lastSeenAt: new Date(),
                        username: sender.username || null,
                        firstName: sender.firstName || null,
                        lastName: sender.lastName || null,
                        botId: bot.id,
                    },
                    create: {
                        chatId,
                        telegramUserId,
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
        }, new NewMessage({}));

        this.logger.log(
            `[MtprotoProvider] Client "${bot.name}" (${bot.id}) conectado.`,
        );
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
