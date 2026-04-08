import axios from "axios";
import { Buffer } from "buffer";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessageTemplate, MessageTemplateMedia } from "@prisma/client";
import { AiAgentService } from "../../modules/ai-agent/ai-agent.service";
import { WhatsappMessageType } from "../queue/constants/whatsapp-queue.constants";
import { WhatsappOutgoingJobData } from "../queue/types/whatsapp-jobs.types";

type PreviewTemplate = MessageTemplate & {
    mediaItems: MessageTemplateMedia[];
};

type ResolvedMediaPayload = {
    mediaUrl?: string | null;
    messageType: WhatsappMessageType;
};

type TtsAudioResult = {
    mediaBase64: string;
    mimeType: string;
    fileName: string;
};

@Injectable()
export class MediaHandlerService {
    private readonly logger = new Logger(MediaHandlerService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly aiAgentService: AiAgentService,
    ) {}

    async prepareOutgoingMessage(
        data: WhatsappOutgoingJobData,
    ): Promise<WhatsappOutgoingJobData> {
        const cleanedText = this.removeAudioTriggers(data.text).trim();
        const hasAudioTrigger = this.hasAudioTrigger(data.text);
        const preparedBase: WhatsappOutgoingJobData = {
            ...data,
            text: cleanedText || data.text.trim(),
            prepared: true,
        };

        if (hasAudioTrigger) {
            const ttsText = cleanedText.trim();

            if (!ttsText) {
                throw new Error(
                    "Nao foi possivel gerar audio: texto vazio apos remover gatilho [AUDIO]",
                );
            }

            const ttsAudio = await this.generateTtsAudio(ttsText);

            return {
                ...preparedBase,
                text: ttsText,
                messageType: "AUDIO",
                mediaUrl: null,
                mediaBase64: ttsAudio.mediaBase64,
                mimeType: ttsAudio.mimeType,
                fileName: ttsAudio.fileName,
            };
        }

        const resolvedMedia = await this.resolveMediaPayload(preparedBase);

        if (resolvedMedia.messageType === "TEXT") {
            return {
                ...preparedBase,
                messageType: "TEXT",
                mediaUrl: null,
                mediaBase64: null,
                mimeType: null,
                fileName: null,
            };
        }

        if (resolvedMedia.messageType === "AUDIO") {
            return this.prepareAudioMessage(preparedBase, resolvedMedia.mediaUrl);
        }

        if (resolvedMedia.messageType === "IMAGE") {
            return this.prepareUrlMediaMessage(
                preparedBase,
                "IMAGE",
                resolvedMedia.mediaUrl,
            );
        }

        return this.prepareUrlMediaMessage(
            preparedBase,
            "VIDEO",
            resolvedMedia.mediaUrl,
        );
    }

    private async prepareAudioMessage(
        data: WhatsappOutgoingJobData,
        mediaUrl?: string | null,
    ): Promise<WhatsappOutgoingJobData> {
        if (data.mediaBase64) {
            const mimeType = this.normalizeMimeType(data.mimeType) || "audio/ogg";
            this.assertSupportedMimeType("AUDIO", mimeType);

            return {
                ...data,
                messageType: "AUDIO",
                mimeType,
                fileName: data.fileName ?? `audio_${Date.now()}.ogg`,
                mediaUrl: null,
            };
        }

        if (!mediaUrl) {
            throw new Error(
                "Mensagem de audio requer mediaUrl valida ou mediaBase64",
            );
        }

        const remoteAudio = await this.fetchRemoteMedia(mediaUrl);
        const inputExt =
            this.inferExtensionFromMime(remoteAudio.mimeType) ||
            this.inferExtensionFromUrl(mediaUrl) ||
            "mp3";
        const oggBuffer = await this.convertToOggOpus(
            remoteAudio.buffer,
            inputExt,
        );

        return {
            ...data,
            messageType: "AUDIO",
            mediaUrl: null,
            mediaBase64: oggBuffer.toString("base64"),
            mimeType: "audio/ogg",
            fileName: data.fileName ?? `audio_${Date.now()}.ogg`,
        };
    }

    private async prepareUrlMediaMessage(
        data: WhatsappOutgoingJobData,
        messageType: "IMAGE" | "VIDEO",
        mediaUrl?: string | null,
    ): Promise<WhatsappOutgoingJobData> {
        const validUrl = this.assertValidHttpUrl(
            mediaUrl,
            `Mensagem ${messageType} requer mediaUrl publica valida`,
        );
        const mimeType = await this.detectRemoteMimeType(validUrl);

        this.assertSupportedMimeType(messageType, mimeType);

        return {
            ...data,
            messageType,
            mediaUrl: validUrl,
            mediaBase64: null,
            mimeType,
            fileName:
                data.fileName ??
                `media_${Date.now()}.${this.inferExtensionFromMime(mimeType) ?? "bin"}`,
        };
    }

    private async resolveMediaPayload(
        data: WhatsappOutgoingJobData,
    ): Promise<ResolvedMediaPayload> {
        if (data.mediaUrl) {
            return {
                mediaUrl: data.mediaUrl,
                messageType: data.messageType ?? "TEXT",
            };
        }

        if (data.mediaBase64) {
            return {
                mediaUrl: null,
                messageType: data.messageType ?? "AUDIO",
            };
        }

        if (!data.previewTemplateIds?.length) {
            return {
                mediaUrl: null,
                messageType: data.messageType ?? "TEXT",
            };
        }

        const templates =
            (await this.aiAgentService.getTemplatesByIds(
                data.previewTemplateIds,
            )) as PreviewTemplate[];

        const preferredType = data.messageType ?? "TEXT";

        for (const template of templates) {
            const resolved = this.getTemplateMediaPayload(template, preferredType);
            if (
                resolved.mediaUrl ||
                (resolved.messageType !== "TEXT" && preferredType !== "TEXT")
            ) {
                return resolved;
            }
        }

        return {
            mediaUrl: null,
            messageType: preferredType,
        };
    }

    private getTemplateMediaPayload(
        template: PreviewTemplate,
        preferredType: WhatsappMessageType,
    ): ResolvedMediaPayload {
        const directPayload = this.buildMediaPayload(
            template.mediaUrl ?? null,
            this.mapTemplateType(template.type),
            preferredType,
        );

        if (directPayload.mediaUrl) {
            return directPayload;
        }

        for (const item of template.mediaItems) {
            const itemPayload = this.buildMediaPayload(
                item.url,
                this.mapTemplateType(item.type),
                preferredType,
            );

            if (itemPayload.mediaUrl || itemPayload.messageType !== "TEXT") {
                return itemPayload;
            }
        }

        if (directPayload.messageType !== "TEXT") {
            return directPayload;
        }

        return {
            mediaUrl: null,
            messageType: preferredType,
        };
    }

    private buildMediaPayload(
        mediaUrl: string | null,
        mediaType: WhatsappMessageType,
        preferredType: WhatsappMessageType,
    ): ResolvedMediaPayload {
        if (!mediaUrl) {
            return {
                mediaUrl: null,
                messageType: preferredType,
            };
        }

        if (preferredType !== "TEXT" && mediaType === preferredType) {
            return {
                mediaUrl,
                messageType: mediaType,
            };
        }

        if (mediaType !== "TEXT") {
            return {
                mediaUrl,
                messageType: mediaType,
            };
        }

        return {
            mediaUrl: null,
            messageType: preferredType,
        };
    }

    private async generateTtsAudio(text: string): Promise<TtsAudioResult> {
        const url = this.configService.get<string>("WHATSAPP_TTS_API_URL")?.trim();

        if (!url) {
            throw new Error("WHATSAPP_TTS_API_URL nao configurada");
        }

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        const token = this.configService.get<string>("WHATSAPP_TTS_API_TOKEN")?.trim();

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await axios.post(
            url,
            {
                text,
                voice:
                    this.configService.get<string>("WHATSAPP_TTS_VOICE")?.trim() ||
                    "default",
                format:
                    this.configService
                        .get<string>("WHATSAPP_TTS_INPUT_FORMAT")
                        ?.trim() || "mp3",
            },
            {
                headers,
                responseType: "arraybuffer",
                timeout: Number(
                    this.configService.get("WHATSAPP_TTS_TIMEOUT_MS") ?? 20_000,
                ),
            },
        );

        const { buffer, inputExt } = await this.extractTtsBuffer(response.data, {
            contentType: response.headers["content-type"],
        });
        const oggBuffer = await this.convertToOggOpus(buffer, inputExt);

        return {
            mediaBase64: oggBuffer.toString("base64"),
            mimeType: "audio/ogg",
            fileName: `tts_${Date.now()}.ogg`,
        };
    }

    private async extractTtsBuffer(
        rawData: ArrayBuffer,
        metadata: { contentType?: string },
    ): Promise<{ buffer: Buffer; inputExt: string }> {
        const contentType = this.normalizeMimeType(metadata.contentType);
        const buffer = Buffer.from(rawData);

        if (contentType === "application/json") {
            const payload = JSON.parse(buffer.toString("utf8"));
            const nestedBase64 =
                payload.audioBase64 ??
                payload.base64 ??
                payload.data ??
                payload.audio?.base64;

            if (typeof nestedBase64 === "string") {
                return {
                    buffer: Buffer.from(nestedBase64, "base64"),
                    inputExt:
                        this.inferExtensionFromMime(payload.mimeType) ||
                        this.inferExtensionFromMime(payload.contentType) ||
                        "mp3",
                };
            }

            const audioUrl = payload.audioUrl ?? payload.url ?? payload.audio?.url;

            if (typeof audioUrl === "string") {
                const remote = await this.fetchRemoteMedia(audioUrl);

                return {
                    buffer: remote.buffer,
                    inputExt:
                        this.inferExtensionFromMime(remote.mimeType) ||
                        this.inferExtensionFromUrl(audioUrl) ||
                        "mp3",
                };
            }

            throw new Error(
                "Resposta JSON do TTS nao contem audioBase64 nem audioUrl",
            );
        }

        return {
            buffer,
            inputExt:
                this.inferExtensionFromMime(contentType) ||
                this.configService
                    .get<string>("WHATSAPP_TTS_INPUT_FORMAT")
                    ?.trim() ||
                "mp3",
        };
    }

    private async fetchRemoteMedia(
        url: string,
    ): Promise<{ buffer: Buffer; mimeType: string }> {
        const validUrl = this.assertValidHttpUrl(
            url,
            "mediaUrl invalida para download remoto",
        );

        const response = await axios.get(validUrl, {
            responseType: "arraybuffer",
            timeout: Number(
                this.configService.get("WHATSAPP_MEDIA_FETCH_TIMEOUT_MS") ?? 20_000,
            ),
        });

        const mimeType =
            this.normalizeMimeType(response.headers["content-type"]) ||
            this.inferMimeTypeFromUrl(validUrl) ||
            "application/octet-stream";

        return {
            buffer: Buffer.from(response.data),
            mimeType,
        };
    }

    private async detectRemoteMimeType(url: string): Promise<string> {
        const validUrl = this.assertValidHttpUrl(url, "mediaUrl invalida");

        try {
            const response = await axios.head(validUrl, {
                timeout: Number(
                    this.configService.get("WHATSAPP_MEDIA_HEAD_TIMEOUT_MS") ?? 10_000,
                ),
            });
            const mimeType = this.normalizeMimeType(
                response.headers["content-type"],
            );

            if (mimeType) {
                return mimeType;
            }
        } catch (error) {
            this.logger.debug(
                `[detectRemoteMimeType] HEAD falhou para ${validUrl}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        return (
            this.inferMimeTypeFromUrl(validUrl) || "application/octet-stream"
        );
    }

    private async convertToOggOpus(
        inputBuffer: Buffer,
        inputExt: string,
    ): Promise<Buffer> {
        const ffmpeg = require("fluent-ffmpeg");
        const tmpInput = path.join(
            os.tmpdir(),
            `wa_audio_in_${Date.now()}.${inputExt}`,
        );
        const tmpOutput = path.join(
            os.tmpdir(),
            `wa_audio_out_${Date.now()}.ogg`,
        );

        await fs.promises.writeFile(tmpInput, inputBuffer);

        try {
            await new Promise<void>((resolve, reject) => {
                ffmpeg(tmpInput)
                    .audioCodec("libopus")
                    .audioChannels(1)
                    .audioFrequency(48000)
                    .format("ogg")
                    .on("end", resolve)
                    .on("error", (err: any) =>
                        reject(
                            new Error(
                                `ffmpeg conversion failed: ${err?.message ?? JSON.stringify(err)}`,
                            ),
                        ),
                    )
                    .save(tmpOutput);
            });
        } finally {
            await fs.promises.unlink(tmpInput).catch(() => {});
        }

        const outputBuffer = await fs.promises.readFile(tmpOutput);
        await fs.promises.unlink(tmpOutput).catch(() => {});
        return outputBuffer;
    }

    private assertSupportedMimeType(
        messageType: WhatsappMessageType,
        mimeType: string,
    ): void {
        const supportedMimeTypes: Record<WhatsappMessageType, string[]> = {
            TEXT: [],
            AUDIO: ["audio/ogg"],
            IMAGE: ["image/jpeg", "image/png"],
            VIDEO: ["video/mp4", "video/3gpp"],
        };

        if (!supportedMimeTypes[messageType].includes(mimeType)) {
            throw new Error(
                `Mimetype "${mimeType}" nao e compativel com ${messageType} na API da Meta`,
            );
        }
    }

    private assertValidHttpUrl(value: string | null | undefined, message: string): string {
        if (!value) {
            throw new Error(message);
        }

        try {
            const parsed = new URL(value);

            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                throw new Error("unsupported protocol");
            }

            return parsed.toString();
        } catch (_) {
            throw new Error(message);
        }
    }

    private hasAudioTrigger(text: string): boolean {
        return /\[AUDIO\]/i.test(text);
    }

    private removeAudioTriggers(text: string): string {
        return text.replace(/\[AUDIO\]/gi, " ");
    }

    private normalizeMimeType(value?: string | null): string | null {
        if (!value) {
            return null;
        }

        return value.split(";")[0]?.trim().toLowerCase() || null;
    }

    private inferMimeTypeFromUrl(url: string): string | null {
        const ext = this.inferExtensionFromUrl(url);

        if (ext === "jpg" || ext === "jpeg") {
            return "image/jpeg";
        }

        if (ext === "png") {
            return "image/png";
        }

        if (ext === "mp4") {
            return "video/mp4";
        }

        if (ext === "3gp" || ext === "3gpp") {
            return "video/3gpp";
        }

        if (ext === "ogg" || ext === "oga") {
            return "audio/ogg";
        }

        if (ext === "mp3") {
            return "audio/mpeg";
        }

        return null;
    }

    private inferExtensionFromUrl(url: string): string | null {
        return (
            url.split(".").pop()?.split(/[#?]/)[0]?.trim().toLowerCase() || null
        );
    }

    private inferExtensionFromMime(mimeType?: string | null): string | null {
        const normalized = this.normalizeMimeType(mimeType);

        if (normalized === "audio/ogg") {
            return "ogg";
        }

        if (normalized === "audio/mpeg") {
            return "mp3";
        }

        if (normalized === "image/jpeg") {
            return "jpg";
        }

        if (normalized === "image/png") {
            return "png";
        }

        if (normalized === "video/mp4") {
            return "mp4";
        }

        if (normalized === "video/3gpp") {
            return "3gp";
        }

        return null;
    }

    private mapTemplateType(type: string): WhatsappMessageType {
        if (type === "AUDIO") {
            return "AUDIO";
        }

        if (type === "IMAGE") {
            return "IMAGE";
        }

        if (type === "VIDEO") {
            return "VIDEO";
        }

        return "TEXT";
    }
}
