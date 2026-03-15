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
