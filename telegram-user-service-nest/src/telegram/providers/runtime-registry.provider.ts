import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "crypto";

const IORedis = require("ioredis");

@Injectable()
export class RuntimeRegistryProvider implements OnModuleDestroy {
    private readonly logger = new Logger(RuntimeRegistryProvider.name);
    private readonly redis: any;
    private readonly lockPrefix = "telegram:runtime:lock";
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

    async deleteChatConnection(
        botId: string,
        chatId: string | number,
    ): Promise<void> {
        await this.redis.del(this.chatConnectionKey(botId, chatId));
    }

    async acquireLock(
        lockName: string,
        ttlSeconds: number,
    ): Promise<string | null> {
        const token = randomUUID();
        const result = await this.redis.set(
            this.lockKey(lockName),
            token,
            "EX",
            ttlSeconds,
            "NX",
        );

        return result === "OK" ? token : null;
    }

    async releaseLock(lockName: string, token: string): Promise<boolean> {
        const result = await this.redis.eval(
            `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                end
                return 0
            `,
            1,
            this.lockKey(lockName),
            token,
        );

        return result === 1;
    }

    async runWithLock<T>(
        lockName: string,
        ttlSeconds: number,
        fn: () => Promise<T>,
    ): Promise<{ acquired: boolean; result?: T }> {
        const token = await this.acquireLock(lockName, ttlSeconds);
        if (!token) {
            return { acquired: false };
        }

        try {
            return {
                acquired: true,
                result: await fn(),
            };
        } finally {
            const released = await this.releaseLock(lockName, token);
            if (!released) {
                this.logger.warn(
                    `[lock] lock "${lockName}" expirou ou mudou de owner antes do release`,
                );
            }
        }
    }

    async getTransferRateState(botId: string): Promise<{
        count: number;
        resetAt: number;
    }> {
        const [countRaw, resetAtRaw] = await this.redis.hmget(
            this.transferRateStateKey(botId),
            "count",
            "resetAt",
        );

        return {
            count: Number(countRaw ?? 0),
            resetAt: Number(resetAtRaw ?? 0),
        };
    }

    async setTransferRateState(
        botId: string,
        state: { count: number; resetAt: number },
    ): Promise<void> {
        await this.redis.hmset(this.transferRateStateKey(botId), {
            count: state.count,
            resetAt: state.resetAt,
        });
        await this.redis.expire(this.transferRateStateKey(botId), 60 * 60 * 24 * 3);
    }

    async incrementTransferDailyCount(botId: string): Promise<number> {
        const count = await this.redis.hincrby(
            this.transferRateStateKey(botId),
            "count",
            1,
        );
        await this.redis.expire(this.transferRateStateKey(botId), 60 * 60 * 24 * 3);
        return Number(count);
    }

    async getTransferFloodWait(botId: string): Promise<number | null> {
        const raw = await this.redis.get(this.transferFloodWaitKey(botId));
        return raw ? Number(raw) : null;
    }

    async setTransferFloodWait(
        botId: string,
        untilTimestampMs: number,
    ): Promise<void> {
        const ttlMs = Math.max(1, untilTimestampMs - Date.now());
        await this.redis.set(
            this.transferFloodWaitKey(botId),
            String(untilTimestampMs),
            "PX",
            ttlMs,
        );
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

    private lockKey(lockName: string): string {
        return `${this.lockPrefix}:${lockName}`;
    }

    private transferRateStateKey(botId: string): string {
        return `telegram:runtime:transfer-rate:${botId}`;
    }

    private transferFloodWaitKey(botId: string): string {
        return `telegram:runtime:transfer-flood-wait:${botId}`;
    }

    private getEnvNumber(name: string, fallback: number): number {
        const value = Number(process.env[name]);
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }
}
