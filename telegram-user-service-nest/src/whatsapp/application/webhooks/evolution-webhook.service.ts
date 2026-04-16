import { Injectable, Logger } from "@nestjs/common";
import { ChatMessageRole, ChatMessageType, Prisma } from "@prisma/client";
import { EvolutionService } from "../../../modules/evolution/evolution.service";
import { OperatingHoursService } from "../../../modules/operating-hours/operating-hours.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { WhatsappIncomingDebounceService } from "../../queue/services/whatsapp-incoming-debounce.service";
import { WhatsappQueueService } from "../../queue/services/whatsapp-queue.service";
import { WhatsappEventsService } from "../../realtime/whatsapp-events.service";
import { WhatsappMessageType } from "../../queue/constants/whatsapp-queue.constants";

type EvolutionWebhookPayload = Record<string, any>;

type EvolutionMessageRecord = {
    key?: {
        id?: string;
        fromMe?: boolean;
        remoteJid?: string;
        participant?: string;
    };
    message?: Record<string, any>;
    pushName?: string;
    messageTimestamp?: string | number;
};

type ParsedIncomingMessage = {
    chatId: string | null;
    text: string | null;
    mediaUrl: string | null;
    mediaMimeType: string | null;
    messageType: WhatsappMessageType;
    location:
        | {
              latitude: number;
              longitude: number;
          }
        | null;
    messageId: string | null;
    pushName: string | null;
    fromMe: boolean;
    isGroup: boolean;
};

const DISCONNECTED_STATES = new Set([
    "close",
    "closed",
    "disconnected",
    "disconnect",
    "loggedout",
    "logout",
    "logoff",
]);

const CONNECTED_STATES = new Set(["open", "connected"]);
const CONNECTING_STATES = new Set([
    "connecting",
    "pairing",
    "qrcode",
    "qr",
]);
const SILENT_IGNORED_EVENTS = new Set([
    "CHATS_UPSERT",
    "CHATS_UPDATE",
    "MESSAGES_UPDATE",
    "CONTACTS_UPSERT",
    "CONTACTS_UPDATE",
    "PRESENCE_UPDATE",
]);

@Injectable()
export class EvolutionWebhookService {
    private readonly logger = new Logger(EvolutionWebhookService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly evolutionService: EvolutionService,
        private readonly operatingHoursService: OperatingHoursService,
        private readonly whatsappQueueService: WhatsappQueueService,
        private readonly whatsappIncomingDebounceService: WhatsappIncomingDebounceService,
        private readonly whatsappEventsService: WhatsappEventsService,
    ) {}

    async handleWebhook(payload: unknown): Promise<void> {
        const rawPayload = this.asRecord(payload);
        const data = this.asRecord(rawPayload.data);
        const rawEventType = this.normalizeString(
            rawPayload.event ?? rawPayload.type ?? data.event ?? data.type,
        );
        const eventType = this.normalizeEventType(rawEventType);
        const instanceName = this.extractInstanceName(rawPayload, data);

        await this.logWebhookEvent(rawPayload, eventType, instanceName);

        if (!eventType) {
            this.logger.warn("[handleWebhook] evento Evolution sem identificador");
            return;
        }

        if (!instanceName) {
            this.logger.warn(
                `[handleWebhook] evento=${eventType} recebido sem instanceName`,
            );
            return;
        }

        const instance = await this.prisma.whatsappInstance.findFirst({
            where: { instanceName },
            select: {
                id: true,
                userId: true,
                instanceName: true,
                status: true,
            },
        });

        const remoteJid = rawPayload.data.key.remoteJid;

        // Se o JID terminar com @g.us, ignoramos a mensagem
        if (remoteJid.endsWith('@g.us')) {
            console.log(`[Webhook] Mensagem de grupo ignorada: ${remoteJid}`);
            return; // Encerra a execução aqui
        }

        if (!instance) {
            this.logger.warn(
                `[handleWebhook] instancia Evolution nao mapeada localmente instanceName=${instanceName} evento=${eventType}`,
            );
            return;
        }

        switch (eventType) {
            case "MESSAGES_UPSERT":
                await this.handleMessagesUpsert(instance, rawPayload, data);
                this.logger.log("[MENSAGEM_RECEBIDA]: dados recebidos do webhook da Evolution", rawPayload);
                return;
            case "CONNECTION_UPDATE":
                await this.handleConnectionUpdate(instance, rawPayload, data);
                return;
            default:
                if (SILENT_IGNORED_EVENTS.has(eventType)) {
                    return;
                }

                this.logger.debug(
                    `[handleWebhook] evento Evolution ignorado eventType=${eventType} instanceName=${instanceName}`,
                );
        }
    }

    private async handleMessagesUpsert(
        instance: {
            id: string;
            userId: string;
            instanceName: string;
        },
        rawPayload: EvolutionWebhookPayload,
        data: EvolutionWebhookPayload,
    ): Promise<void> {
        const messages = this.extractMessageRecords(rawPayload, data);

        if (!messages.length) {
            this.logger.debug(
                `[handleMessagesUpsert] nenhum registro de mensagem encontrado instanceId=${instance.id}`,
            );
            return;
        }

        for (const message of messages) {
            const parsed = this.parseIncomingMessage(message);

            if (!parsed.chatId || parsed.fromMe || parsed.isGroup) {
                continue;
            }

            const incomingActivityToken =
                await this.whatsappIncomingDebounceService.markIncomingActivity(
                    instance.id,
                    parsed.chatId,
                    parsed.messageId,
                );

            await this.upsertWhatsappCustomer({
                ownerUserId: instance.userId,
                instanceId: instance.id,
                chatId: parsed.chatId,
                displayName: parsed.pushName,
                lastMessageText: this.buildCustomerLastMessagePreview(parsed),
            });

            if (!parsed.text && !parsed.mediaUrl && !parsed.location) {
                continue;
            }

            const operatingHours = await this.operatingHoursService.isStoreOpen(
                instance.userId,
            );

            if (!operatingHours.isOpen) {
                await this.sendClosedStoreAutoReply(
                    instance,
                    parsed,
                    operatingHours.message,
                );
                continue;
            }

            const incomingData = {
                instanceId: instance.id,
                chatId: parsed.chatId,
                text: parsed.text ?? undefined,
                mediaUrl: parsed.mediaUrl,
                mediaMimeType: parsed.mediaMimeType,
                messageType: parsed.messageType,
                payload: {
                    source: "evolution-webhook",
                    eventType: "MESSAGES_UPSERT",
                    messageId: parsed.messageId,
                    pushName: parsed.pushName,
                    messageTimestamp:
                        message.messageTimestamp !== undefined
                            ? String(message.messageTimestamp)
                            : null,
                    incomingActivityToken,
                    location: parsed.location,
                },
            } as const;

            if (this.shouldDebounceIncomingMessage(parsed)) {
                await this.whatsappIncomingDebounceService.debounceIncomingTextMessage(
                    incomingData,
                );
                continue;
            }

            await this.whatsappQueueService.enqueueIncomingMessage(incomingData);
        }
    }

    private shouldDebounceIncomingMessage(
        parsed: ParsedIncomingMessage,
    ): boolean {
        return (
            parsed.messageType === "TEXT" &&
            Boolean(parsed.text?.trim()) &&
            !parsed.mediaUrl &&
            !parsed.location
        );
    }

    private async sendClosedStoreAutoReply(
        instance: {
            id: string;
            userId: string;
            instanceName: string;
        },
        parsed: ParsedIncomingMessage,
        message: string,
    ): Promise<void> {
        const trimmedMessage = message.trim();

        if (!trimmedMessage || !parsed.chatId) {
            return;
        }

        await this.evolutionService.sendText(instance.instanceName, {
            number: parsed.chatId,
            text: trimmedMessage,
        });

        await this.prisma.chatMessage.create({
            data: {
                botId: null,
                telegramId: this.buildWhatsappConversationKey(
                    instance.id,
                    parsed.chatId,
                ),
                role: ChatMessageRole.model,
                content: trimmedMessage,
                messageType: ChatMessageType.TEXT,
                aiModel: "system:operating-hours-auto-reply",
                mediaUrl: null,
            },
        });
    }

    private async handleConnectionUpdate(
        instance: {
            id: string;
            userId: string;
            instanceName: string;
            status: string;
        },
        rawPayload: EvolutionWebhookPayload,
        data: EvolutionWebhookPayload,
    ): Promise<void> {
        const rawState = this.normalizeString(
            data.state ??
                rawPayload.state ??
                data.status ??
                rawPayload.status ??
                data.connectionState,
        );
        const statusReason = this.normalizeString(
            data.statusReason ??
                data.reason ??
                rawPayload.statusReason ??
                rawPayload.reason,
        );
        const mappedStatus = this.mapConnectionStateToStatus(rawState);

        if (!mappedStatus) {
            this.logger.debug(
                `[handleConnectionUpdate] estado nao mapeado instanceId=${instance.id} state=${rawState ?? "unknown"}`,
            );
            return;
        }

        if (instance.status === mappedStatus) {
            if (mappedStatus === "DISCONNECTED") {
                this.emitStatusEvent(instance, instance.status, statusReason);
            }
            return;
        }

        await this.prisma.whatsappInstance.update({
            where: { id: instance.id },
            data: {
                status: mappedStatus,
            },
        });

        this.emitStatusEvent(instance, instance.status, statusReason, mappedStatus);
    }

    private emitStatusEvent(
        instance: {
            id: string;
            userId: string;
            instanceName: string;
            status: string;
        },
        previousStatus: string | null,
        reason?: string | null,
        nextStatus?: string,
    ): void {
        this.whatsappEventsService.emitInstanceStatusChanged(instance.userId, {
            instanceId: instance.id,
            instanceName: instance.instanceName,
            status: nextStatus ?? instance.status,
            previousStatus,
            reason: reason ?? null,
            changedAt: new Date().toISOString(),
        });
    }

    private extractMessageRecords(
        rawPayload: EvolutionWebhookPayload,
        data: EvolutionWebhookPayload,
    ): EvolutionMessageRecord[] {
        const candidates = [
            rawPayload.data,
            data.messages,
            data.message,
            rawPayload.messages,
            rawPayload.message,
            data,
        ];

        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                return candidate
                    .map((item) => this.asMessageRecord(item))
                    .filter((item): item is EvolutionMessageRecord => Boolean(item));
            }

            const record = this.asMessageRecord(candidate);
            if (record) {
                return [record];
            }
        }

        return [];
    }

    private asMessageRecord(value: unknown): EvolutionMessageRecord | null {
        if (!value || typeof value !== "object") {
            return null;
        }

        const candidate = value as EvolutionMessageRecord;
        if (!candidate.key || !candidate.message) {
            return null;
        }

        return candidate;
    }

    private parseIncomingMessage(
        record: EvolutionMessageRecord,
    ): ParsedIncomingMessage {
        const remoteJid = this.normalizeString(record.key?.remoteJid);
        const message = this.asRecord(record.message);
        const text = this.extractMessageText(message);
        const mediaUrl = this.extractMediaUrl(message);
        const mediaMimeType = this.extractMediaMimeType(message);
        const location = this.extractLocation(message);
        const messageType = this.detectMessageType(message, location);

        return {
            chatId: remoteJid,
            text,
            mediaUrl,
            mediaMimeType,
            messageType,
            location,
            messageId: this.normalizeString(record.key?.id),
            pushName: this.normalizeString(record.pushName),
            fromMe: Boolean(record.key?.fromMe),
            isGroup: Boolean(remoteJid?.endsWith("@g.us")),
        };
    }

    private async upsertWhatsappCustomer(input: {
        ownerUserId: string;
        instanceId: string;
        chatId: string;
        displayName?: string | null;
        lastMessageText?: string | null;
    }): Promise<void> {
        const now = new Date();
        const normalizedDisplayName = this.normalizeString(input.displayName);
        const normalizedLastMessageText = this.normalizeString(
            input.lastMessageText,
        );

        await this.prisma.whatsappCustomer.upsert({
            where: {
                ownerUserId_whatsappId: {
                    ownerUserId: input.ownerUserId,
                    whatsappId: input.chatId,
                },
            },
            create: {
                ownerUserId: input.ownerUserId,
                whatsappInstanceId: input.instanceId,
                whatsappId: input.chatId,
                displayName: normalizedDisplayName ?? undefined,
                lastMessageText: normalizedLastMessageText ?? undefined,
                firstSeenAt: now,
                lastSeenAt: now,
            },
            update: {
                whatsappInstanceId: input.instanceId,
                lastSeenAt: now,
                ...(normalizedDisplayName
                    ? { displayName: normalizedDisplayName }
                    : {}),
                ...(normalizedLastMessageText
                    ? { lastMessageText: normalizedLastMessageText }
                    : {}),
            },
        });
    }

    private buildCustomerLastMessagePreview(
        parsed: ParsedIncomingMessage,
    ): string | null {
        if (parsed.text) {
            return parsed.text.slice(0, 2_000);
        }

        if (parsed.location) {
            return "[LOCALIZACAO]";
        }

        switch (parsed.messageType) {
            case "AUDIO":
                return "[AUDIO]";
            case "IMAGE":
                return "[IMAGEM]";
            case "VIDEO":
                return "[VIDEO]";
            default:
                return parsed.mediaUrl ? "[MIDIA]" : null;
        }
    }

    private extractMessageText(message: EvolutionWebhookPayload): string | null {
        const candidates = [
            message.conversation,
            message.extendedTextMessage?.text,
            message.imageMessage?.caption,
            message.videoMessage?.caption,
            message.documentMessage?.caption,
            message.buttonsResponseMessage?.selectedDisplayText,
            message.listResponseMessage?.title,
            message.templateButtonReplyMessage?.selectedDisplayText,
        ];

        for (const candidate of candidates) {
            const text = this.normalizeString(candidate);
            if (text) {
                return text;
            }
        }

        return null;
    }

    private extractMediaUrl(message: EvolutionWebhookPayload): string | null {
        const candidates = [
            message.audioMessage?.url,
            message.imageMessage?.url,
            message.videoMessage?.url,
            message.documentMessage?.url,
        ];

        for (const candidate of candidates) {
            const mediaUrl = this.normalizeString(candidate);
            if (mediaUrl) {
                return mediaUrl;
            }
        }

        return null;
    }

    private extractMediaMimeType(
        message: EvolutionWebhookPayload,
    ): string | null {
        const candidates = [
            message.audioMessage?.mimetype,
            message.imageMessage?.mimetype,
            message.videoMessage?.mimetype,
            message.documentMessage?.mimetype,
        ];

        for (const candidate of candidates) {
            const mimeType = this.normalizeMimeType(candidate);
            if (mimeType) {
                return mimeType;
            }
        }

        return null;
    }

    private extractLocation(message: EvolutionWebhookPayload): {
        latitude: number;
        longitude: number;
    } | null {
        const locationMessage =
            message.locationMessage ?? message.liveLocationMessage;

        if (!locationMessage || typeof locationMessage !== "object") {
            return null;
        }

        const latitude = Number(
            locationMessage.degreesLatitude ?? locationMessage.latitude,
        );
        const longitude = Number(
            locationMessage.degreesLongitude ?? locationMessage.longitude,
        );

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        return { latitude, longitude };
    }

    private detectMessageType(
        message: EvolutionWebhookPayload,
        location: { latitude: number; longitude: number } | null,
    ): WhatsappMessageType {
        if (message.audioMessage) {
            return "AUDIO";
        }

        if (message.imageMessage) {
            return "IMAGE";
        }

        if (message.videoMessage) {
            return "VIDEO";
        }

        if (location) {
            return "TEXT";
        }

        return "TEXT";
    }

    private extractInstanceName(
        rawPayload: EvolutionWebhookPayload,
        data: EvolutionWebhookPayload,
    ): string | null {
        const candidates = [
            rawPayload.instance,
            rawPayload.instanceName,
            rawPayload.instance?.instanceName,
            rawPayload.sender,
            data.instance,
            data.instanceName,
            data.instance?.instanceName,
        ];

        for (const candidate of candidates) {
            const value = this.normalizeString(candidate);
            if (value) {
                return value;
            }
        }

        return null;
    }

    private buildWhatsappConversationKey(
        instanceId: string,
        chatId: string,
    ): string {
        return `whatsapp:${instanceId}:${chatId}`;
    }

    private mapConnectionStateToStatus(state: string | null): string | null {
        if (!state) {
            return null;
        }

        const normalized = state.toLowerCase();

        if (CONNECTED_STATES.has(normalized)) {
            return "CONNECTED";
        }

        if (CONNECTING_STATES.has(normalized)) {
            return "CONNECTING";
        }

        if (DISCONNECTED_STATES.has(normalized)) {
            return "DISCONNECTED";
        }

        return null;
    }

    private async logWebhookEvent(
        rawPayload: EvolutionWebhookPayload,
        eventType: string | null,
        instanceName: string | null,
    ): Promise<void> {
        try {
            await this.prisma.webhookEvent.create({
                data: {
                    provider: "EVOLUTION",
                    eventType: eventType ?? "unknown",
                    referenceId: instanceName,
                    rawPayload: rawPayload as Prisma.InputJsonValue,
                },
            });
        } catch (error) {
            this.logger.warn(
                `[logWebhookEvent] falha ao persistir webhook da Evolution: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    private asRecord(value: unknown): EvolutionWebhookPayload {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return {};
        }

        return value as EvolutionWebhookPayload;
    }

    private normalizeString(value: unknown): string | null {
        if (typeof value !== "string") {
            return null;
        }

        const normalized = value.trim();
        return normalized || null;
    }

    private normalizeEventType(value: string | null): string | null {
        if (!value) {
            return null;
        }

        const normalized = value
            .trim()
            .replace(/[^a-zA-Z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .toUpperCase();

        return normalized || null;
    }

    private normalizeMimeType(value: unknown): string | null {
        if (typeof value !== "string") {
            return null;
        }

        const normalized = value.split(";")[0]?.trim().toLowerCase();
        return normalized || null;
    }
}
