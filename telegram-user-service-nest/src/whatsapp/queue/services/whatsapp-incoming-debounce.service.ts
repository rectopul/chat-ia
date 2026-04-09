import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import IORedis, { Redis } from "ioredis";
import { Queue } from "bullmq";
import { WhatsappInstanceService } from "../../application/instances/whatsapp-instance.service";
import {
    WHATSAPP_INCOMING_DEBOUNCE_DELAY_MS,
    WHATSAPP_INCOMING_JOB_NAME,
    WHATSAPP_INCOMING_QUEUE_NAME,
} from "../constants/whatsapp-queue.constants";
import { WhatsappIncomingJobData } from "../types/whatsapp-jobs.types";

type DebounceBuffer = {
    instanceId: string;
    chatId: string;
    textParts: string[];
    payload: Record<string, unknown>;
    version: number;
};

@Injectable()
export class WhatsappIncomingDebounceService implements OnModuleDestroy {
    private readonly logger = new Logger(WhatsappIncomingDebounceService.name);
    private readonly redis: Redis;

    constructor(
        private readonly whatsappInstanceService: WhatsappInstanceService,
        @InjectQueue(WHATSAPP_INCOMING_QUEUE_NAME)
        private readonly incomingQueue: Queue<WhatsappIncomingJobData>,
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
                `[redis] falha no debounce de entrada do WhatsApp: ${error.message}`,
                error.stack,
            );
        });
    }

    async onModuleDestroy(): Promise<void> {
        try {
            await this.redis.quit();
        } catch (error: unknown) {
            this.logger.debug(
                `[redis] erro ao encerrar debounce do WhatsApp: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    async debounceIncomingTextMessage(
        data: WhatsappIncomingJobData,
    ): Promise<void> {
        await this.whatsappInstanceService.ensureInstanceExists(data.instanceId);

        const text = data.text?.trim();
        if (!text) {
            await this.incomingQueue.add(
                WHATSAPP_INCOMING_JOB_NAME,
                {
                    ...data,
                    messageType: data.messageType ?? "TEXT",
                    processingStage: data.processingStage ?? "typing",
                },
                {
                    removeOnComplete: { count: 100 },
                    removeOnFail: { count: 100 },
                },
            );
            return;
        }

        const debounceDelayMs = this.getDebounceDelayMs();
        const debounceKey = this.buildDebounceKey(data.instanceId, data.chatId);
        const buffer = await this.loadBuffer(debounceKey);
        const nextBuffer = this.mergeBuffer(buffer, data, text);

        await this.redis.set(
            debounceKey,
            JSON.stringify(nextBuffer),
            "PX",
            debounceDelayMs * 6,
        );

        await this.incomingQueue.add(
            WHATSAPP_INCOMING_JOB_NAME,
            {
                instanceId: data.instanceId,
                chatId: data.chatId,
                messageType: "TEXT",
                processingStage: "typing",
                debounceKey,
                debounceVersion: nextBuffer.version,
                payload: {
                    source: "evolution-webhook",
                    debounced: true,
                },
            },
            {
                jobId: this.buildDebounceJobId(
                    data.instanceId,
                    data.chatId,
                    nextBuffer.version,
                ),
                delay: debounceDelayMs,
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 100 },
            },
        );

        this.logger.debug(
            `[debounceIncomingTextMessage] agendado instanceId=${data.instanceId} chatId=${data.chatId} version=${nextBuffer.version} parts=${nextBuffer.textParts.length} delayMs=${debounceDelayMs}`,
        );
    }

    async consumeDebouncedMessage(
        data: WhatsappIncomingJobData,
    ): Promise<WhatsappIncomingJobData | null> {
        if (!data.debounceKey || typeof data.debounceVersion !== "number") {
            return data;
        }

        const buffer = await this.loadBuffer(data.debounceKey);

        if (!buffer) {
            return null;
        }

        if (buffer.version !== data.debounceVersion) {
            return null;
        }

        await this.redis.del(data.debounceKey);

        return {
            instanceId: buffer.instanceId,
            chatId: buffer.chatId,
            text: buffer.textParts.join("\n").trim(),
            mediaUrl: null,
            messageType: "TEXT",
            processingStage: data.processingStage ?? "typing",
            payload: buffer.payload,
        };
    }

    private buildDebounceKey(instanceId: string, chatId: string): string {
        return `whatsapp:incoming:debounce:${instanceId}:${chatId}`;
    }

    private buildDebounceJobId(
        instanceId: string,
        chatId: string,
        version: number,
    ): string {
        return `whatsapp-debounce__${instanceId}__${chatId}__v${version}`.replace(
            /[:\s]/g,
            "_",
        );
    }

    private async loadBuffer(debounceKey: string): Promise<DebounceBuffer | null> {
        const raw = await this.redis.get(debounceKey);

        if (!raw) {
            return null;
        }

        try {
            const parsed = JSON.parse(raw) as Partial<DebounceBuffer>;
            if (!parsed.instanceId || !parsed.chatId) {
                return null;
            }

            return {
                instanceId: parsed.instanceId,
                chatId: parsed.chatId,
                textParts: Array.isArray(parsed.textParts)
                    ? parsed.textParts
                          .map((part) => String(part).trim())
                          .filter(Boolean)
                    : [],
                payload:
                    parsed.payload && typeof parsed.payload === "object"
                        ? (parsed.payload as Record<string, unknown>)
                        : {},
                version: Number(parsed.version ?? 0) || 0,
            };
        } catch (error) {
            this.logger.warn(
                `[loadBuffer] buffer de debounce invalido; reiniciando chave=${debounceKey} motivo=${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return null;
        }
    }

    private mergeBuffer(
        currentBuffer: DebounceBuffer | null,
        data: WhatsappIncomingJobData,
        text: string,
    ): DebounceBuffer {
        const previousParts = currentBuffer?.textParts ?? [];
        const nextParts = this.appendTextPart(previousParts, text);
        const payload = {
            ...(currentBuffer?.payload ?? {}),
            ...(data.payload ?? {}),
            debounceMessageCount: nextParts.length,
            messageId:
                this.extractStringValue(data.payload, "messageId") ??
                this.extractStringValue(currentBuffer?.payload, "messageId") ??
                null,
            debouncedMessageIds: this.mergeStringArrays(
                currentBuffer?.payload?.debouncedMessageIds,
                this.extractStringValue(data.payload, "messageId"),
            ),
        };

        return {
            instanceId: data.instanceId,
            chatId: data.chatId,
            textParts: nextParts,
            payload,
            version: (currentBuffer?.version ?? 0) + 1,
        };
    }

    private appendTextPart(existingParts: string[], text: string): string[] {
        const trimmed = text.trim();

        if (!trimmed) {
            return existingParts;
        }

        const normalizedText = this.normalizeText(trimmed);
        const lastPart = existingParts[existingParts.length - 1];

        if (lastPart && this.normalizeText(lastPart) === normalizedText) {
            return existingParts;
        }

        return [...existingParts, trimmed];
    }

    private extractStringValue(
        payload: Record<string, unknown> | undefined,
        key: string,
    ): string | null {
        const value = payload?.[key];
        return typeof value === "string" && value.trim() ? value.trim() : null;
    }

    private mergeStringArrays(
        existing: unknown,
        latestValue?: string | null,
    ): string[] {
        const merged = new Set<string>();

        if (Array.isArray(existing)) {
            for (const value of existing) {
                if (typeof value === "string" && value.trim()) {
                    merged.add(value.trim());
                }
            }
        }

        if (latestValue?.trim()) {
            merged.add(latestValue.trim());
        }

        return [...merged];
    }

    private normalizeText(value: string): string {
        return value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }

    private getDebounceDelayMs(): number {
        const configured = Number(
            process.env.WHATSAPP_INCOMING_DEBOUNCE_MS ??
                WHATSAPP_INCOMING_DEBOUNCE_DELAY_MS,
        );

        return Number.isFinite(configured) && configured >= 0
            ? Math.trunc(configured)
            : WHATSAPP_INCOMING_DEBOUNCE_DELAY_MS;
    }
}
