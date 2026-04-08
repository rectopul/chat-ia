import { randomUUID } from "crypto";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { EvolutionService } from "../../modules/evolution/evolution.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
    WHATSAPP_MAX_MESSAGES_PER_MINUTE,
    WHATSAPP_RATE_LIMIT_WINDOW_MS,
} from "../queue/constants/whatsapp-queue.constants";
import { WhatsappOutgoingJobData } from "../queue/types/whatsapp-jobs.types";

const IORedis = require("ioredis");

type ReserveSlotResult = {
    allowed: boolean;
    retryAfterMs: number;
};

@Injectable()
export class WhatsappSenderService implements OnModuleDestroy {
    private readonly logger = new Logger(WhatsappSenderService.name);
    private readonly redis: any;

    constructor(
        private readonly prisma: PrismaService,
        private readonly evolutionService: EvolutionService,
    ) {
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
                `[redis] falha no sender do WhatsApp: ${error.message}`,
                error.stack,
            );
        });
    }

    async onModuleDestroy(): Promise<void> {
        if (!this.redis) {
            return;
        }

        try {
            await this.redis.quit();
        } catch (error: any) {
            this.logger.debug(
                `[redis] erro ao encerrar sender do WhatsApp: ${error?.message ?? error}`,
            );
        }
    }

    async sendQueuedMessage(
        data: WhatsappOutgoingJobData,
        jobId?: string,
    ): Promise<void> {
        const instance = await this.prisma.whatsappInstance.findUnique({
            where: { id: data.instanceId },
        });

        if (!instance) {
            throw new Error(
                `WhatsApp instance "${data.instanceId}" nao encontrada para envio`,
            );
        }

        const text = data.text?.trim() ?? "";
        const typingDurationMs = this.calculateTypingDuration(text);
        const replyContext = this.extractReplyContext(data);

        await this.runBestEffort("read-receipt", async () => {
            if (!replyContext?.messageId) {
                return;
            }

            await this.sendReadReceipt(
                instance,
                data.chatId,
                replyContext.messageId,
            );
        });
        await this.runBestEffort("typing-start", async () => {
            await this.sendTypingIndicator(instance, data.chatId, "composing");
        });
        await this.delay(typingDurationMs);
        await this.runBestEffort("typing-stop", async () => {
            await this.sendTypingIndicator(instance, data.chatId, "paused");
        });
        await this.delay(this.randomBetween(1000, 3000));

        await this.waitForRateLimitSlot(instance.id, jobId);

        await this.sendMessage(instance, data, replyContext);

        this.logger.debug(
            `[sendQueuedMessage] instanceId=${instance.id} chatId=${data.chatId} messageType=${data.messageType ?? "TEXT"}`,
        );
    }

    private async sendReadReceipt(
        instance: {
            id: string;
            instanceName: string;
            webhookUrl: string | null;
        },
        chatId: string,
        messageId: string,
    ): Promise<void> {
        await this.evolutionService.markMessageAsRead(instance.instanceName, {
            remoteJid: chatId,
            id: messageId,
        });
    }

    private async sendTypingIndicator(
        instance: {
            id: string;
            instanceName: string;
            webhookUrl: string | null;
        },
        chatId: string,
        presence: "composing" | "paused" | "recording",
    ): Promise<void> {
        await this.evolutionService.sendPresence(instance.instanceName, {
            number: chatId,
            presence,
        });
    }

    private async sendMessage(
        instance: {
            id: string;
            instanceName: string;
            webhookUrl: string | null;
        },
        data: WhatsappOutgoingJobData,
        replyContext?: {
            messageId?: string;
            messageText?: string;
        } | null,
    ): Promise<void> {
        const quoted =
            replyContext?.messageId
                ? {
                      key: {
                          id: replyContext.messageId,
                      },
                      message: {
                          conversation: replyContext.messageText ?? "",
                      },
                  }
                : undefined;

        if ((data.messageType ?? "TEXT") === "AUDIO") {
            const audio = data.mediaBase64 ?? data.mediaUrl ?? null;

            if (!audio) {
                throw new Error(
                    `Midia de audio nao informada para instance="${instance.instanceName}"`,
                );
            }

            await this.evolutionService.sendWhatsAppAudio(instance.instanceName, {
                number: data.chatId,
                audio,
                quoted,
            });
            return;
        }

        if (
            (data.messageType ?? "TEXT") === "IMAGE" ||
            (data.messageType ?? "TEXT") === "VIDEO"
        ) {
            const media = data.mediaBase64 ?? data.mediaUrl ?? null;

            if (!media) {
                throw new Error(
                    `Midia nao informada para instance="${instance.instanceName}"`,
                );
            }

            await this.evolutionService.sendMedia(instance.instanceName, {
                number: data.chatId,
                media,
                mediaType:
                    (data.messageType ?? "TEXT") === "VIDEO" ? "video" : "image",
                mimeType: data.mimeType,
                fileName: data.fileName,
                caption: data.text,
                quoted,
            });
            return;
        }

        await this.evolutionService.sendText(instance.instanceName, {
            number: data.chatId,
            text: data.text,
            quoted,
        });
    }

    private async waitForRateLimitSlot(
        instanceId: string,
        jobId?: string,
    ): Promise<void> {
        const reservationId = jobId
            ? `${jobId}:${randomUUID()}`
            : randomUUID();

        while (true) {
            const result = await this.reserveRateLimitSlot(instanceId, reservationId);

            if (result.allowed) {
                return;
            }

            await this.delay(Math.max(result.retryAfterMs, 250));
        }
    }

    private async reserveRateLimitSlot(
        instanceId: string,
        reservationId: string,
    ): Promise<ReserveSlotResult> {
        const now = Date.now();
        const windowMs = WHATSAPP_RATE_LIMIT_WINDOW_MS;
        const key = this.rateLimitKey(instanceId);

        const result = (await this.redis.eval(
            `
                redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, ARGV[1] - ARGV[2])
                local count = redis.call("ZCARD", KEYS[1])
                if count < tonumber(ARGV[3]) then
                    redis.call("ZADD", KEYS[1], ARGV[1], ARGV[4])
                    redis.call("PEXPIRE", KEYS[1], ARGV[2])
                    return {1, 0}
                end

                local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
                if oldest[2] == nil then
                    return {0, ARGV[2]}
                end

                local retryAfter = tonumber(oldest[2]) + tonumber(ARGV[2]) - tonumber(ARGV[1])
                if retryAfter < 0 then
                    retryAfter = 0
                end

                return {0, retryAfter}
            `,
            1,
            key,
            now,
            windowMs,
            WHATSAPP_MAX_MESSAGES_PER_MINUTE,
            `${reservationId}:${now}`,
        )) as [number, number];

        return {
            allowed: Number(result?.[0] ?? 0) === 1,
            retryAfterMs: Number(result?.[1] ?? 0),
        };
    }

    private calculateTypingDuration(text: string): number {
        const length = text.trim().length;
        if (!length) {
            return 2000;
        }

        return Math.max(2000, Math.min(length * 50, 5000));
    }

    private randomBetween(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private rateLimitKey(instanceId: string): string {
        return `whatsapp:rate-limit:${instanceId}`;
    }

    private extractReplyContext(data: WhatsappOutgoingJobData): {
        messageId?: string;
        messageText?: string;
    } | null {
        const payload = (data.payload ?? {}) as Record<string, unknown>;
        const messageId =
            typeof payload.replyToMessageId === "string"
                ? payload.replyToMessageId.trim()
                : typeof payload.messageId === "string"
                  ? payload.messageId.trim()
                  : "";
        const messageText =
            typeof payload.replyToText === "string"
                ? payload.replyToText
                : typeof payload.messageText === "string"
                  ? payload.messageText
                  : "";

        if (!messageId && !messageText) {
            return null;
        }

        return {
            messageId: messageId || undefined,
            messageText: messageText || undefined,
        };
    }

    private async runBestEffort(
        operation: string,
        action: () => Promise<void>,
    ): Promise<void> {
        try {
            await action();
        } catch (error) {
            this.logger.debug(
                `[${operation}] falhou sem bloquear envio: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    private async delay(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
