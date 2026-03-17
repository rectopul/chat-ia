// src/telegram/providers/bot-api.provider.ts
//
// Dono exclusivo dos Maps de businessBots, tokens e connections.
// Expõe helpers HTTP para a Bot API.

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import { PrismaService } from "src/prisma/prisma.service";

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

    constructor(private readonly prisma: PrismaService) {}

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

    getToken(botId: string): string | undefined {
        return this.tokens.get(botId);
    }

    setToken(botId: string, token: string): void {
        this.tokens.set(botId, token);
    }

    // ── Connection maps ───────────────────────────────────────────────────

    setOwnerConnection(
        botId: string,
        userTelegramId: string,
        connectionId: string,
    ): void {
        this.ownerConnections.set(`${botId}:${userTelegramId}`, connectionId);
    }

    deleteOwnerConnection(botId: string, userTelegramId: string): void {
        this.ownerConnections.delete(`${botId}:${userTelegramId}`);
    }

    setChatConnection(
        botId: string,
        chatId: string | number,
        connectionId: string,
    ): void {
        this.chatConnections.set(`${botId}:${chatId}`, connectionId);
    }

    getOwnerConnectionId(
        botId: string,
        userTelegramId: string,
    ): string | undefined {
        return this.ownerConnections.get(`${botId}:${userTelegramId}`);
    }

    /**
     * Resolve o connectionId para um chatId dado.
     * Prioridade: (1) chatConnections, (2) ownerConnections, (3) banco.
     */
    async resolveConnectionForChat(
        botId: string,
        chatId: string | number,
    ): Promise<string | undefined> {
        const fromChat = this.chatConnections.get(`${botId}:${chatId}`);
        if (fromChat) return fromChat;

        const fromOwner = this.ownerConnections.get(`${botId}:${chatId}`);
        if (fromOwner) return fromOwner;

        const conn = await this.prisma.businessConnection.findFirst({
            where: { botId, isEnabled: true },
        });
        return conn?.connectionId;
    }

    /** Carrega connections salvas no banco ao inicializar o bot. */
    loadSavedConnections(
        botId: string,
        conns: Array<{ userTelegramId: string; connectionId: string }>,
    ): void {
        for (const c of conns) {
            this.ownerConnections.set(
                `${botId}:${c.userTelegramId}`,
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

        this.logger.debug(`sendMessage payload: ${JSON.stringify(payload)}`);
        const { data } = await axios.post(url, payload);
        if (!data.ok)
            throw new Error(
                `Telegram sendMessage error: ${JSON.stringify(data)}`,
            );
        return data.result;
    }

    async answerCallbackQuery(token: string, queryId: string): Promise<void> {
        try {
            await axios.post(
                `https://api.telegram.org/bot${token}/answerCallbackQuery`,
                { callback_query_id: queryId },
            );
        } catch (_) {}
    }
}
