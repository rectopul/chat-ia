// src/telegram/interfaces/index.ts

import { Api } from "telegram";

export type MediaMeta = {
    ext: string;
    mimeType: string;
    isVideo: boolean;
    isAudio: boolean;
    isImage: boolean;
};

export type ReadyItem = {
    finalMedia: Api.TypeInputMedia;
    isImage: boolean;
    isVideo: boolean;
    isAudio: boolean;
};

export type MediaItem = {
    url: string;
    fileId?: string;
    itemId?: string;
};

export type BusinessCtx = {
    token: string;
    businessConnectionId: string;
    botId: string;
};

export type BotStatusItem = {
    key: string;
    label: string;
    description: string;
    ok: boolean;
    critical: boolean;
};

export type BotStatusResponse = {
    allCriticalOk: boolean;
    items: BotStatusItem[];
};

// ─── Job payloads ─────────────────────────────────────────────────────────────

export interface SendComboJobData {
    botId: string;
    chatId: string;
    template: {
        id: string;
        type: string;
        text?: string | null;
        mediaUrl?: string | null;
        telegramFileId?: string | null;
        mediaItems: Array<{
            id: string;
            url: string;
            type: string;
            order: number;
            telegramFileId?: string | null;
        }>;
    };
    businessCtx?: BusinessCtx; // presente quando é contexto business (Bot API)
}

export interface SendSingleMediaJobData {
    botId: string;
    chatId: string;
    template: {
        id: string;
        type: string;
        text?: string | null;
        mediaUrl?: string | null;
        telegramFileId?: string | null;
        mediaItems?: Array<{
            id: string;
            url: string;
            type: string;
            order: number;
            telegramFileId?: string | null;
        }>;
    };
    businessCtx?: BusinessCtx;
}
