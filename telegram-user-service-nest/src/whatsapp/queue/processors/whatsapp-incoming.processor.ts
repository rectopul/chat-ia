import { Processor, WorkerHost } from "@nestjs/bullmq";
import {
    ForbiddenException,
    Logger,
    UnauthorizedException,
} from "@nestjs/common";
import {
    ChatMessageType,
    MediaType,
    MessageTemplate,
    MessageTemplateMedia,
    SubscriptionStatus,
} from "@prisma/client";
import { Job } from "bullmq";
import { WhatsappHandoverService } from "../../application/handover/whatsapp-handover.service";
import { WhatsappQueueService } from "../services/whatsapp-queue.service";
import {
    WHATSAPP_INCOMING_JOB_NAME,
    WHATSAPP_INCOMING_QUEUE_NAME,
    WhatsappMessageType,
} from "../constants/whatsapp-queue.constants";
import { WhatsappIncomingJobData } from "../types/whatsapp-jobs.types";
import { DeliveryOrderService } from "../../../modules/delivery/delivery-order.service";
import {
    extractAiErrorMessage,
    isAiQuotaError,
} from "../../../modules/ai-agent/ai-error.utils";
import { AiAgentRepository } from "../../../modules/ai-agent/ai-agent.repository";
import {
    AiAgentReply,
    AiAgentService,
} from "../../../modules/ai-agent/ai-agent.service";
import { SubscriptionService } from "../../../modules/subscription/subscription.service";

type PreviewTemplate = MessageTemplate & {
    mediaItems: MessageTemplateMedia[];
};

type CustomerLocation = {
    latitude: number;
    longitude: number;
};

const HANDOVER_KEYWORDS = ["atendente", "problema"];
const LONG_REPLY_THRESHOLD = 240;
const SPLIT_REPLY_DELAY_MS = 2000;

@Processor(WHATSAPP_INCOMING_QUEUE_NAME, { concurrency: 3 })
export class WhatsappIncomingProcessor extends WorkerHost {
    private readonly logger = new Logger(WhatsappIncomingProcessor.name);

    constructor(
        private readonly aiAgentRepository: AiAgentRepository,
        private readonly aiAgentService: AiAgentService,
        private readonly deliveryOrderService: DeliveryOrderService,
        private readonly whatsappHandoverService: WhatsappHandoverService,
        private readonly whatsappQueueService: WhatsappQueueService,
        private readonly subscriptionService: SubscriptionService,
    ) {
        super();
    }

    async process(job: Job<WhatsappIncomingJobData>): Promise<void> {
        if (job.name !== WHATSAPP_INCOMING_JOB_NAME) {
            throw new Error(`Unsupported WhatsApp job received: ${job.name}`);
        }

        const text = job.data.text?.trim();
        const incomingMessageType = this.toChatMessageType(job.data.messageType);
        const hasAudioInput =
            incomingMessageType === ChatMessageType.AUDIO &&
            Boolean(job.data.mediaUrl);
        const location = this.extractLocation(job.data);
        const handoverKeywords = this.extractHandoverKeywords(text);

        if (!text && !hasAudioInput && !location) {
            await job.updateProgress(100);
            return;
        }

        try {
            await job.updateProgress(20);

            const accessContext =
                await this.aiAgentRepository.getWhatsappInstanceAccessContext(
                    job.data.instanceId,
                );

            if (!accessContext) {
                this.logger.warn(
                    `[process] WhatsApp instance nao encontrada instanceId=${job.data.instanceId}`,
                );
                await job.updateProgress(100);
                return;
            }

            if (
                !accessContext.hasActiveAccess ||
                accessContext.subscriptionStatus !== SubscriptionStatus.ACTIVE
            ) {
                this.logger.debug(
                    `[process] IA ignorada para instanceId=${job.data.instanceId} chatId=${job.data.chatId} hasActiveAccess=${accessContext.hasActiveAccess} subscriptionStatus=${accessContext.subscriptionStatus ?? "NONE"}`,
                );
                await job.updateProgress(100);
                return;
            }

            try {
                await this.subscriptionService.assertAiAccessForUser(
                    accessContext.ownerUserId,
                );
            } catch (error) {
                if (
                    error instanceof ForbiddenException ||
                    error instanceof UnauthorizedException
                ) {
                    this.logger.debug(
                        `[process] IA bloqueada por limite/plano instanceId=${job.data.instanceId} ownerUserId=${accessContext.ownerUserId} reason=${error.message}`,
                    );
                    await job.updateProgress(100);
                    return;
                }

                throw error;
            }

            if (handoverKeywords.length) {
                await this.whatsappHandoverService.openHandover({
                    userId: accessContext.ownerUserId,
                    instanceId: job.data.instanceId,
                    chatId: job.data.chatId,
                    triggerText: text || undefined,
                    lastCustomerMessage: text || undefined,
                    triggerKeywords: handoverKeywords,
                });

                const handoverReply =
                    "Claro! Vou chamar um atendente para te ajudar por aqui.";

                await this.whatsappQueueService.enqueueOutgoingMessage({
                    instanceId: job.data.instanceId,
                    chatId: job.data.chatId,
                    text: handoverReply,
                    messageType: "TEXT",
                    payload: {
                        source: "handover",
                        handoverKeywords,
                        incomingJobId: job.id ?? null,
                        replyToMessageId: this.extractIncomingMessageId(job.data),
                        replyToText: text || null,
                    },
                });

                await this.aiAgentService.saveWhatsappModelMessage(
                    job.data.instanceId,
                    job.data.chatId,
                    handoverReply,
                    ChatMessageType.TEXT,
                );

                await job.updateProgress(100);
                return;
            }

            const hasOpenHandover =
                await this.whatsappHandoverService.hasOpenHandover(
                    job.data.instanceId,
                    job.data.chatId,
                );

            if (location) {
                const locationResult = await this.handleLocationInput({
                    instanceId: job.data.instanceId,
                    chatId: job.data.chatId,
                    ownerUserId: accessContext.ownerUserId,
                    location,
                });

                if (!text && !hasAudioInput) {
                    if (!hasOpenHandover) {
                        const locationReply = `Recebi seu endereco: ${this.truncateAddress(
                            locationResult.address,
                        )}. Se quiser, continuo montando seu pedido por aqui.`;

                        await this.whatsappQueueService.enqueueOutgoingMessage({
                            instanceId: job.data.instanceId,
                            chatId: job.data.chatId,
                            text: locationReply,
                            messageType: "TEXT",
                            payload: {
                                source: "delivery-location",
                                incomingJobId: job.id ?? null,
                                replyToMessageId:
                                    this.extractIncomingMessageId(job.data),
                                replyToText: text || null,
                            },
                        });

                        await this.aiAgentService.saveWhatsappModelMessage(
                            job.data.instanceId,
                            job.data.chatId,
                            locationReply,
                            ChatMessageType.TEXT,
                        );
                    }

                    await job.updateProgress(100);
                    return;
                }
            }

            if (hasOpenHandover) {
                this.logger.debug(
                    `[process] atendimento humano ativo para instanceId=${job.data.instanceId} chatId=${job.data.chatId}; bot em silencio`,
                );
                await job.updateProgress(100);
                return;
            }

            const reply: AiAgentReply =
                await this.aiAgentService.generateWhatsappResponse({
                    instanceId: job.data.instanceId,
                    chatId: job.data.chatId,
                    ownerUserId: accessContext.ownerUserId,
                    personaName: accessContext.personaName,
                    messageText: text || undefined,
                    mediaUrl: job.data.mediaUrl ?? null,
                    messageType: incomingMessageType,
                });

            await job.updateProgress(70);

            const suggestedMediaType = await this.resolveSuggestedMediaType(
                reply.previewTemplateIds,
            );

            if (suggestedMediaType === "TEXT") {
                const replyChunks = this.splitReplyText(reply.text);

                for (const [index, chunk] of replyChunks.entries()) {
                    await this.whatsappQueueService.enqueueOutgoingMessage(
                        {
                            instanceId: job.data.instanceId,
                            chatId: job.data.chatId,
                            text: chunk,
                            messageType: "TEXT",
                            previewTemplateIds:
                                index === replyChunks.length - 1
                                    ? reply.previewTemplateIds
                                    : [],
                            payload: {
                                source: "ai-agent",
                                incomingJobId: job.id ?? null,
                                chunkIndex: index + 1,
                                totalChunks: replyChunks.length,
                                replyToMessageId:
                                    this.extractIncomingMessageId(job.data),
                                replyToText: text || null,
                            },
                        },
                        {
                            delay: index === 0 ? 0 : SPLIT_REPLY_DELAY_MS,
                        },
                    );

                    await this.aiAgentService.saveWhatsappModelMessage(
                        job.data.instanceId,
                        job.data.chatId,
                        chunk,
                        ChatMessageType.TEXT,
                    );
                }
            } else {
                await this.whatsappQueueService.enqueueOutgoingMessage({
                    instanceId: job.data.instanceId,
                    chatId: job.data.chatId,
                    text: reply.text,
                    messageType: suggestedMediaType,
                    previewTemplateIds: reply.previewTemplateIds,
                    payload: {
                        source: "ai-agent",
                        incomingJobId: job.id ?? null,
                        replyToMessageId: this.extractIncomingMessageId(job.data),
                        replyToText: text || null,
                    },
                });

                await this.aiAgentService.saveWhatsappModelMessage(
                    job.data.instanceId,
                    job.data.chatId,
                    reply.text,
                    this.toChatMessageType(suggestedMediaType),
                );
            }

            await job.updateProgress(100);
        } catch (error) {
            if (isAiQuotaError(error)) {
                this.logger.debug(
                    `[process] Quota do Gemini indisponivel para instanceId=${job.data.instanceId} chatId=${job.data.chatId}; seguindo sem ruido`,
                );
                await job.updateProgress(100);
                return;
            }

            this.logger.error(
                `[process] Falha ao processar WhatsApp instanceId=${job.data.instanceId} chatId=${job.data.chatId}`,
                error instanceof Error
                    ? error.stack
                    : extractAiErrorMessage(error),
            );
            throw error;
        }
    }

    private async handleLocationInput(input: {
        instanceId: string;
        chatId: string;
        ownerUserId: string;
        location: CustomerLocation;
    }) {
        return this.deliveryOrderService.saveLocationAndSyncDraftOrder({
            ownerUserId: input.ownerUserId,
            instanceId: input.instanceId,
            whatsappId: input.chatId,
            latitude: input.location.latitude,
            longitude: input.location.longitude,
        });
    }

    private extractLocation(
        data: WhatsappIncomingJobData,
    ): CustomerLocation | null {
        const payload = (data.payload ?? {}) as Record<string, any>;
        const candidates: Array<[unknown, unknown]> = [
            [payload.latitude, payload.longitude],
            [payload.lat, payload.lng],
            [payload.lat, payload.lon],
            [payload.location?.latitude, payload.location?.longitude],
            [payload.location?.lat, payload.location?.lng],
            [payload.message?.location?.latitude, payload.message?.location?.longitude],
            [payload.message?.location?.lat, payload.message?.location?.lng],
        ];

        for (const [latitudeValue, longitudeValue] of candidates) {
            const latitude = Number(latitudeValue);
            const longitude = Number(longitudeValue);

            if (this.isValidCoordinatePair(latitude, longitude)) {
                return { latitude, longitude };
            }
        }

        const text = data.text?.trim() ?? "";
        const match = text.match(
            /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/,
        );

        if (!match) {
            return null;
        }

        const latitude = Number(match[1]);
        const longitude = Number(match[2]);

        return this.isValidCoordinatePair(latitude, longitude)
            ? { latitude, longitude }
            : null;
    }

    private isValidCoordinatePair(
        latitude: number,
        longitude: number,
    ): boolean {
        return (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180
        );
    }

    private extractHandoverKeywords(text?: string): string[] {
        const normalized = this.normalizeText(text ?? "");
        return HANDOVER_KEYWORDS.filter((keyword) =>
            normalized.includes(keyword),
        );
    }

    private splitReplyText(text: string): string[] {
        const normalized = text.replace(/\s+/g, " ").trim();

        if (normalized.length <= LONG_REPLY_THRESHOLD) {
            return [normalized];
        }

        const sentences = normalized
            .split(/(?<=[.!?])\s+/)
            .map((sentence) => sentence.trim())
            .filter(Boolean);

        if (sentences.length >= 2) {
            const midpoint = Math.ceil(normalized.length / 2);
            const firstChunk: string[] = [];
            let currentLength = 0;

            for (const sentence of sentences) {
                const candidateLength = currentLength + sentence.length + 1;
                if (
                    firstChunk.length > 0 &&
                    candidateLength > midpoint
                ) {
                    break;
                }

                firstChunk.push(sentence);
                currentLength = candidateLength;
            }

            const secondChunk = sentences.slice(firstChunk.length).join(" ").trim();

            if (firstChunk.length > 0 && secondChunk) {
                return [firstChunk.join(" ").trim(), secondChunk];
            }
        }

        const splitIndex = normalized.lastIndexOf(
            " ",
            Math.ceil(normalized.length / 2),
        );

        if (splitIndex > 0) {
            return [
                normalized.slice(0, splitIndex).trim(),
                normalized.slice(splitIndex + 1).trim(),
            ].filter(Boolean);
        }

        return [normalized];
    }

    private truncateAddress(address: string): string {
        const trimmed = address.trim();

        if (trimmed.length <= 110) {
            return trimmed;
        }

        return `${trimmed.slice(0, 107)}...`;
    }

    private extractIncomingMessageId(
        data: WhatsappIncomingJobData,
    ): string | null {
        const payload = (data.payload ?? {}) as Record<string, unknown>;
        const messageId =
            typeof payload.messageId === "string" ? payload.messageId.trim() : "";

        return messageId || null;
    }

    private normalizeText(value: string): string {
        return value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }

    private async resolveSuggestedMediaType(
        templateIds: string[],
    ): Promise<WhatsappMessageType> {
        if (!templateIds.length) {
            return "TEXT";
        }

        const templates =
            (await this.aiAgentService.getTemplatesByIds(
                templateIds,
            )) as PreviewTemplate[];

        for (const template of templates) {
            const messageType = this.getTemplateMessageType(template);
            if (messageType !== "TEXT") {
                return messageType;
            }
        }

        return "TEXT";
    }

    private getTemplateMessageType(
        template: PreviewTemplate,
    ): WhatsappMessageType {
        const directType = this.mapMediaType(template.type);
        if (directType !== "TEXT") {
            return directType;
        }

        for (const item of template.mediaItems) {
            const itemType = this.mapMediaType(item.type);
            if (itemType !== "TEXT") {
                return itemType;
            }
        }

        return "TEXT";
    }

    private mapMediaType(type: MediaType): WhatsappMessageType {
        if (type === MediaType.AUDIO) {
            return "AUDIO";
        }

        if (type === MediaType.IMAGE) {
            return "IMAGE";
        }

        if (type === MediaType.VIDEO) {
            return "VIDEO";
        }

        return "TEXT";
    }

    private toChatMessageType(
        messageType?: WhatsappMessageType,
    ): ChatMessageType {
        switch (messageType) {
            case "AUDIO":
                return ChatMessageType.AUDIO;
            case "IMAGE":
                return ChatMessageType.IMAGE;
            case "VIDEO":
                return ChatMessageType.VIDEO;
            default:
                return ChatMessageType.TEXT;
        }
    }
}
