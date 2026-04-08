export const WHATSAPP_INCOMING_QUEUE_NAME = "whatsapp-incoming";
export const WHATSAPP_OUTGOING_QUEUE_NAME = "whatsapp-outgoing";
export const WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME = "whatsapp-media-outgoing";

export const WHATSAPP_INCOMING_JOB_NAME = "process-whatsapp-incoming";
export const WHATSAPP_OUTGOING_JOB_NAME = "process-whatsapp-outgoing";
export const WHATSAPP_MEDIA_OUTGOING_JOB_NAME =
    "process-whatsapp-media-outgoing";

export const WHATSAPP_MAX_MESSAGES_PER_MINUTE = 20;
export const WHATSAPP_RATE_LIMIT_WINDOW_MS = 60_000;

export type WhatsappMessageType = "TEXT" | "AUDIO" | "IMAGE" | "VIDEO";
