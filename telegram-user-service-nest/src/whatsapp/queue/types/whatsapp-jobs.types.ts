import {
    WhatsappIncomingProcessingStage,
    WhatsappMessageType,
} from "../constants/whatsapp-queue.constants";

export interface WhatsappIncomingJobData {
    instanceId: string;
    chatId: string;
    text?: string;
    mediaUrl?: string | null;
    mediaMimeType?: string | null;
    messageType?: WhatsappMessageType;
    processingStage?: WhatsappIncomingProcessingStage;
    debounceKey?: string;
    debounceVersion?: number;
    payload?: Record<string, unknown>;
}

export interface WhatsappOutgoingJobData {
    instanceId: string;
    chatId: string;
    text: string;
    mediaUrl?: string | null;
    mediaBase64?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
    messageType?: WhatsappMessageType;
    previewTemplateIds?: string[];
    prepared?: boolean;
    skipTypingSimulation?: boolean;
    payload?: Record<string, unknown>;
}
