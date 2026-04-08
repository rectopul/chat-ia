import { WhatsappMessageType } from "../constants/whatsapp-queue.constants";

export interface WhatsappIncomingJobData {
    instanceId: string;
    chatId: string;
    text?: string;
    mediaUrl?: string | null;
    messageType?: WhatsappMessageType;
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
    payload?: Record<string, unknown>;
}
