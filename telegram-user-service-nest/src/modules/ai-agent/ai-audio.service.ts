import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { EvolutionService } from "../evolution/evolution.service";

type WhatsappAudioFetchInput = {
    instanceName: string;
    messageId?: string | null;
    mediaUrl?: string | null;
    mimeTypeHint?: string | null;
};

type AudioBufferPayload = {
    buffer: Buffer;
    mimeType: string;
    source: "evolution-base64" | "remote-url";
};

type Base64ExtractionResult = {
    base64: string;
    mimeType: string | null;
};

@Injectable()
export class AiAudioService {
    private readonly logger = new Logger(AiAudioService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly evolutionService: EvolutionService,
    ) {}

    async fetchWhatsappAudio(
        input: WhatsappAudioFetchInput,
    ): Promise<AudioBufferPayload> {
        if (input.messageId) {
            try {
                const decodedFromEvolution =
                    await this.fetchWhatsappAudioFromEvolution(input);

                if (decodedFromEvolution) {
                    return decodedFromEvolution;
                }
            } catch (error) {
                this.logger.warn(
                    `[fetchWhatsappAudio] falha ao obter base64 pela Evolution instanceName=${input.instanceName} messageId=${input.messageId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }

        if (input.mediaUrl) {
            return this.fetchRemoteBinary(input.mediaUrl, input.mimeTypeHint);
        }

        throw new Error("WhatsApp audio media is unavailable");
    }

    private async fetchWhatsappAudioFromEvolution(
        input: WhatsappAudioFetchInput,
    ): Promise<AudioBufferPayload | null> {
        if (!input.messageId) {
            return null;
        }

        const response = await this.evolutionService.getBase64FromMediaMessage(
            input.instanceName,
            {
                messageId: input.messageId,
                convertToMp4: false,
            },
        );
        const extracted = this.extractBase64FromEvolutionResponse(response);

        if (!extracted) {
            this.logger.debug(
                `[fetchWhatsappAudioFromEvolution] resposta sem base64 util instanceName=${input.instanceName} messageId=${input.messageId}`,
            );
            return null;
        }

        return {
            buffer: Buffer.from(extracted.base64, "base64"),
            mimeType:
                this.normalizeMimeType(input.mimeTypeHint) ??
                extracted.mimeType ??
                "audio/ogg",
            source: "evolution-base64",
        };
    }

    private async fetchRemoteBinary(
        mediaUrl: string,
        mimeTypeHint?: string | null,
    ): Promise<AudioBufferPayload> {
        const response = await axios.get<ArrayBuffer>(mediaUrl, {
            responseType: "arraybuffer",
            timeout: Number(
                this.configService.get("WHATSAPP_MEDIA_DOWNLOAD_TIMEOUT_MS") ??
                    15_000,
            ),
        });
        const headerContentType = response.headers["content-type"];
        const mimeType =
            this.normalizeMimeType(mimeTypeHint) ??
            this.normalizeMimeType(headerContentType) ??
            this.inferMimeTypeFromUrl(mediaUrl) ??
            "audio/ogg";

        return {
            buffer: Buffer.from(response.data),
            mimeType,
            source: "remote-url",
        };
    }

    private extractBase64FromEvolutionResponse(
        payload: unknown,
    ): Base64ExtractionResult | null {
        const directString = this.extractBase64String(payload);
        if (directString) {
            return directString;
        }

        const record = this.asRecord(payload);
        const nestedCandidates = [
            record.base64,
            record.data,
            record.media,
            record.message,
            record.response,
            record.result,
            this.asRecord(record.data).base64,
            this.asRecord(record.data).media,
            this.asRecord(record.data).data,
            this.asRecord(record.response).base64,
            this.asRecord(record.response).media,
            this.asRecord(record.message).base64,
        ];

        for (const candidate of nestedCandidates) {
            const extracted = this.extractBase64String(candidate);
            if (extracted) {
                return {
                    base64: extracted.base64,
                    mimeType:
                        extracted.mimeType ??
                        this.extractMimeTypeCandidate(payload),
                };
            }
        }

        return null;
    }

    private extractBase64String(value: unknown): Base64ExtractionResult | null {
        if (typeof value !== "string") {
            return null;
        }

        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        const dataUrlMatch = trimmed.match(
            /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i,
        );

        if (dataUrlMatch) {
            return {
                mimeType: this.normalizeMimeType(dataUrlMatch[1]),
                base64: dataUrlMatch[2].replace(/\s+/g, ""),
            };
        }

        if (this.looksLikeBase64(trimmed)) {
            return {
                mimeType: null,
                base64: trimmed.replace(/\s+/g, ""),
            };
        }

        return null;
    }

    private extractMimeTypeCandidate(payload: unknown): string | null {
        const record = this.asRecord(payload);
        const candidates = [
            record.mimeType,
            record.mimetype,
            record.mediaType,
            record.mediatype,
            this.asRecord(record.data).mimeType,
            this.asRecord(record.data).mimetype,
            this.asRecord(record.response).mimeType,
            this.asRecord(record.response).mimetype,
        ];

        for (const candidate of candidates) {
            const normalized = this.normalizeMimeType(candidate);
            if (normalized) {
                return normalized;
            }
        }

        return null;
    }

    private looksLikeBase64(value: string): boolean {
        if (value.length < 32) {
            return false;
        }

        return /^[a-z0-9+/=\s]+$/i.test(value);
    }

    private normalizeMimeType(value: unknown): string | null {
        if (typeof value !== "string") {
            return null;
        }

        const normalized = value.split(";")[0]?.trim().toLowerCase();

        if (!normalized || normalized === "application/octet-stream") {
            return null;
        }

        return normalized;
    }

    private inferMimeTypeFromUrl(mediaUrl: string): string | null {
        const urlWithoutQuery = mediaUrl.split("?")[0]?.toLowerCase() ?? "";

        if (urlWithoutQuery.endsWith(".ogg") || urlWithoutQuery.endsWith(".opus")) {
            return "audio/ogg";
        }

        if (urlWithoutQuery.endsWith(".mp3")) {
            return "audio/mpeg";
        }

        if (urlWithoutQuery.endsWith(".wav")) {
            return "audio/wav";
        }

        if (urlWithoutQuery.endsWith(".m4a")) {
            return "audio/mp4";
        }

        return null;
    }

    private asRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return {};
        }

        return value as Record<string, unknown>;
    }
}
