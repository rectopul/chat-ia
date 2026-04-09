export const WHATSAPP_INCOMING_QUEUE_NAME = "whatsapp-incoming";
export const WHATSAPP_OUTGOING_QUEUE_NAME = "whatsapp-outgoing";
export const WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME = "whatsapp-media-outgoing";

export const WHATSAPP_INCOMING_JOB_NAME = "process-whatsapp-incoming";
export const WHATSAPP_OUTGOING_JOB_NAME = "process-whatsapp-outgoing";
export const WHATSAPP_MEDIA_OUTGOING_JOB_NAME =
    "process-whatsapp-media-outgoing";

export const WHATSAPP_MAX_MESSAGES_PER_MINUTE = 20;
export const WHATSAPP_RATE_LIMIT_WINDOW_MS = 60_000;
export const WHATSAPP_PRE_AI_TYPING_DELAY_MS = 4_000;
export const WHATSAPP_INCOMING_DEBOUNCE_DELAY_MS = 5_000;

export type WhatsappMessageType = "TEXT" | "AUDIO" | "IMAGE" | "VIDEO";
export type WhatsappIncomingProcessingStage = "typing" | "respond";

export function getWhatsappPreAiTypingDelayMs(): number {
    const configured = Number(
        process.env.WHATSAPP_PRE_AI_TYPING_DELAY_MS ??
            WHATSAPP_PRE_AI_TYPING_DELAY_MS,
    );

    return Number.isFinite(configured) && configured >= 0
        ? Math.trunc(configured)
        : WHATSAPP_PRE_AI_TYPING_DELAY_MS;
}

export function getWhatsappIncomingDebounceDelayMs(): number {
    const configured = Number(
        process.env.WHATSAPP_INCOMING_DEBOUNCE_MS ??
            WHATSAPP_INCOMING_DEBOUNCE_DELAY_MS,
    );

    return Number.isFinite(configured) && configured >= 0
        ? Math.trunc(configured)
        : WHATSAPP_INCOMING_DEBOUNCE_DELAY_MS;
}
