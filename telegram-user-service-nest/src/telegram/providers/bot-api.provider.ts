// src/telegram/providers/bot-api.provider.ts
//
// Dono exclusivo dos Maps de businessBots, tokens e connections.
// Expõe helpers HTTP para a Bot API.

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import { PrismaService } from "src/prisma/prisma.service";
import { RuntimeRegistryProvider } from "./runtime-registry.provider";

@Injectable()
export class BotApiProvider implements OnModuleDestroy {
    private readonly logger = new Logger(BotApiProvider.name);

    // bot instances
    private readonly bots = new Map<string, TelegramBot>();
    private readonly tokens = new Map<string, string>();

    /**
     * Key: `${botId}:${userTelegramId}` → connectionId
     * Registrada quando chega um evento business_connection (dono).
     */
    private readonly ownerConnections = new Map<string, string>();

    /**
     * Key: `${botId}:${chatId}` → connectionId
     * Registrada a cada business_message recebida (cliente).
     * Essencial para resolver a connection em callback_query.
     */
    private readonly chatConnections = new Map<string, string>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: RuntimeRegistryProvider,
    ) {}

    // ── Lifecycle ─────────────────────────────────────────────────────────

    async onModuleDestroy() {
        for (const [id, bot] of this.bots.entries()) {
            try {
                await bot.stopPolling();
            } catch (e) {
                this.logger.error(`Erro ao parar bot ${id}:`, e);
            }
        }
        this.bots.clear();
        this.tokens.clear();
        this.ownerConnections.clear();
        this.chatConnections.clear();
    }

    // ── Bot instances ─────────────────────────────────────────────────────

    getBot(botId: string): TelegramBot | undefined {
        return this.bots.get(botId);
    }

    hasBot(botId: string): boolean {
        return this.bots.has(botId);
    }

    setBot(botId: string, bot: TelegramBot): void {
        this.bots.set(botId, bot);
    }

    deleteBot(botId: string): void {
        this.bots.delete(botId);
    }

    // ── Tokens ────────────────────────────────────────────────────────────

    async getToken(botId: string): Promise<string | undefined> {
        const cached = this.tokens.get(botId);
        if (cached) return cached;

        const persisted = await this.registry.getBotToken(botId);
        if (persisted) {
            this.tokens.set(botId, persisted);
            return persisted;
        }

        return undefined;
    }

    async setToken(botId: string, token: string): Promise<void> {
        this.tokens.set(botId, token);
        await this.registry.setBotToken(botId, token);
    }

    // ── Connection maps ───────────────────────────────────────────────────

    async setOwnerConnection(
        botId: string,
        userTelegramId: string,
        connectionId: string,
    ): Promise<void> {
        this.ownerConnections.set(`${botId}:${userTelegramId}`, connectionId);
        await this.registry.setOwnerConnection(
            botId,
            userTelegramId,
            connectionId,
        );
    }

    async deleteOwnerConnection(
        botId: string,
        userTelegramId: string,
    ): Promise<void> {
        this.ownerConnections.delete(`${botId}:${userTelegramId}`);
        await this.registry.deleteOwnerConnection(botId, userTelegramId);
    }

    async setChatConnection(
        botId: string,
        chatId: string | number,
        connectionId: string,
    ): Promise<void> {
        this.chatConnections.set(`${botId}:${chatId}`, connectionId);
        await this.registry.setChatConnection(botId, chatId, connectionId);
    }

    async deleteChatConnection(
        botId: string,
        chatId: string | number,
    ): Promise<void> {
        this.chatConnections.delete(`${botId}:${chatId}`);
        await this.registry.deleteChatConnection(botId, chatId);
    }

    async getOwnerConnectionId(
        botId: string,
        userTelegramId: string,
    ): Promise<string | undefined> {
        const cacheKey = `${botId}:${userTelegramId}`;
        const cached = this.ownerConnections.get(cacheKey);
        if (cached) return cached;

        const persisted = await this.registry.getOwnerConnection(
            botId,
            userTelegramId,
        );
        if (persisted) {
            this.ownerConnections.set(cacheKey, persisted);
            return persisted;
        }

        return undefined;
    }

    /**
     * Resolve o connectionId para um chatId dado.
     * Prioridade: (1) chatConnections, (2) ownerConnections, (3) banco.
     */
    async resolveConnectionForChat(
        botId: string,
        chatId: string | number,
    ): Promise<string | undefined> {
        const chatKey = `${botId}:${chatId}`;
        const fromChat = this.chatConnections.get(chatKey);
        if (fromChat) return fromChat;

        const persistedChat = await this.registry.getChatConnection(botId, chatId);
        if (persistedChat) {
            this.chatConnections.set(chatKey, persistedChat);
            return persistedChat;
        }

        const fromOwner = await this.getOwnerConnectionId(botId, String(chatId));
        if (fromOwner) return fromOwner;

        const conn = await this.prisma.businessConnection.findFirst({
            where: { botId, isEnabled: true },
        });
        return conn?.connectionId;
    }

    async refreshConnectionForChat(
        botId: string,
        chatId: string | number,
    ): Promise<string | undefined> {
        await this.deleteChatConnection(botId, chatId);
        return this.resolveConnectionForChat(botId, chatId);
    }

    /** Carrega connections salvas no banco ao inicializar o bot. */
    async loadSavedConnections(
        botId: string,
        conns: Array<{ userTelegramId: string; connectionId: string }>,
    ): Promise<void> {
        for (const c of conns) {
            this.ownerConnections.set(
                `${botId}:${c.userTelegramId}`,
                c.connectionId,
            );
            await this.registry.setOwnerConnection(
                botId,
                c.userTelegramId,
                c.connectionId,
            );
        }
    }

    // ── Bot API polling setup ─────────────────────────────────────────────

    async createPollingBot(token: string): Promise<TelegramBot> {
        // Limpa fila de updates anterior para evitar processar mensagens antigas
        try {
            await axios.post(
                `https://api.telegram.org/bot${token}/getUpdates`,
                {
                    timeout: 0,
                    offset: -1,
                },
            );
        } catch (_) {}

        await new Promise((r) => setTimeout(r, 1000));

        return new TelegramBot(token, {
            polling: {
                interval: 300,
                autoStart: true,
                params: {
                    timeout: 10,
                    allowed_updates: [
                        "message",
                        "business_connection",
                        "callback_query",
                        "business_message",
                        "deleted_business_messages",
                    ],
                },
            },
        });
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────

    async sendMessageHttp(
        token: string,
        chatId: number | string,
        text: string,
        extra?: Record<string, any>,
    ): Promise<any> {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const { reply_markup, ...restExtra } = extra ?? {};

        const payload: Record<string, any> = {
            chat_id: chatId,
            text,
            ...restExtra,
        };
        if (reply_markup) {
            payload.reply_markup =
                typeof reply_markup === "string"
                    ? reply_markup
                    : JSON.stringify(reply_markup);
        }

        this.logger.debug(
            `[sendMessageHttp] chatId=${chatId} textLength=${text.length} business=${Boolean(payload.business_connection_id)} markup=${Boolean(reply_markup)}`,
        );

        try {
            const { data } = await axios.post(url, payload);
            if (!data.ok) {
                throw new Error(
                    `Telegram sendMessage error: ${JSON.stringify(data)}`,
                );
            }
            return data.result;
        } catch (err: any) {
            if (this.isBusinessPeerInvalidError(err)) {
                throw err;
            }

            this.logger.error(
                `[sendMessageHttp] chatId=${chatId} falhou: ${err?.response?.data ? JSON.stringify(err.response.data) : err?.message}`,
                err?.stack,
            );
            throw err;
        }
    }

    async answerCallbackQuery(token: string, queryId: string): Promise<void> {
        try {
            await axios.post(
                `https://api.telegram.org/bot${token}/answerCallbackQuery`,
                { callback_query_id: queryId },
            );
        } catch (err: any) {
            this.logger.debug(
                `[answerCallbackQuery] queryId=${queryId} falhou: ${err?.message ?? err}`,
            );
        }
    }

    private isBusinessPeerInvalidError(error: any): boolean {
        const description =
            error?.response?.data?.description ??
            error?.response?.data?.message ??
            error?.message;
        const normalized =
            typeof description === "string"
                ? description.toUpperCase()
                : JSON.stringify(description ?? error).toUpperCase();

        return normalized.includes("BUSINESS_PEER_INVALID");
    }
}
