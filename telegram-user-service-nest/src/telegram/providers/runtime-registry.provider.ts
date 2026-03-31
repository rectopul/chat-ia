import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";

const IORedis = require("ioredis");

@Injectable()
export class RuntimeRegistryProvider implements OnModuleDestroy {
    private readonly logger = new Logger(RuntimeRegistryProvider.name);
    private readonly redis: any;
    private readonly chatConnectionTtlSeconds = this.getEnvNumber(
        "TELEGRAM_CHAT_CONNECTION_TTL_SECONDS",
        60 * 60 * 24 * 7,
    );

    constructor() {
        if (process.env.REDIS_URL) {
            this.redis = new IORedis(process.env.REDIS_URL);
        } else {
            this.redis = new IORedis({
                host: process.env.REDIS_HOST ?? "localhost",
                port: Number(process.env.REDIS_PORT ?? 6379),
                password: process.env.REDIS_PASSWORD || undefined,
                db: Number(process.env.REDIS_DB ?? 0),
            });
        }

        this.redis.on("error", (error: Error) => {
            this.logger.error(
                `[redis] falha no runtime registry: ${error.message}`,
                error.stack,
            );
        });
    }

    async onModuleDestroy(): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis.quit();
        } catch (error: any) {
            this.logger.debug(
                `[redis] erro ao encerrar conexão: ${error?.message ?? error}`,
            );
        }
    }

    async setBotToken(botId: string, token: string): Promise<void> {
        await this.redis.set(this.botTokenKey(botId), token);
    }

    async getBotToken(botId: string): Promise<string | null> {
        return this.redis.get(this.botTokenKey(botId));
    }

    async deleteBotToken(botId: string): Promise<void> {
        await this.redis.del(this.botTokenKey(botId));
    }

    async setOwnerConnection(
        botId: string,
        userTelegramId: string,
        connectionId: string,
    ): Promise<void> {
        await this.redis.set(
            this.ownerConnectionKey(botId, userTelegramId),
            connectionId,
        );
    }

    async getOwnerConnection(
        botId: string,
        userTelegramId: string,
    ): Promise<string | null> {
        return this.redis.get(this.ownerConnectionKey(botId, userTelegramId));
    }

    async deleteOwnerConnection(
        botId: string,
        userTelegramId: string,
    ): Promise<void> {
        await this.redis.del(this.ownerConnectionKey(botId, userTelegramId));
    }

    async setChatConnection(
        botId: string,
        chatId: string | number,
        connectionId: string,
    ): Promise<void> {
        await this.redis.set(
            this.chatConnectionKey(botId, chatId),
            connectionId,
            "EX",
            this.chatConnectionTtlSeconds,
        );
    }

    async getChatConnection(
        botId: string,
        chatId: string | number,
    ): Promise<string | null> {
        return this.redis.get(this.chatConnectionKey(botId, chatId));
    }

    private botTokenKey(botId: string): string {
        return `telegram:runtime:bot-token:${botId}`;
    }

    private ownerConnectionKey(botId: string, userTelegramId: string): string {
        return `telegram:runtime:owner-connection:${botId}:${userTelegramId}`;
    }

    private chatConnectionKey(botId: string, chatId: string | number): string {
        return `telegram:runtime:chat-connection:${botId}:${chatId}`;
    }

    private getEnvNumber(name: string, fallback: number): number {
        const value = Number(process.env[name]);
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }
}
