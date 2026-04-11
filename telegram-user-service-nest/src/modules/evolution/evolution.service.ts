import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, {
    AxiosError,
    AxiosInstance,
    AxiosRequestConfig,
    AxiosResponse,
} from "axios";

type EvolutionCreateInstanceResponse = {
    instance?: {
        instanceName?: string;
        instanceId?: string;
        status?: string;
    };
    hash?: {
        apikey?: string;
    };
    settings?: Record<string, unknown>;
};

type EvolutionInstanceStatusResponse = {
    instance?: {
        instanceName?: string;
        state?: string;
    };
};

type EvolutionConnectInstanceResponse = {
    pairingCode?: string;
    code?: string;
    count?: number;
};

type EvolutionSuccessMessageResponse = {
    status?: string;
    error?: boolean;
    response?: {
        message?: string;
    };
};

type EvolutionQuotedMessage = {
    key: {
        id: string;
    };
    message?: {
        conversation?: string;
    };
};

@Injectable()
export class EvolutionService {
    private readonly logger = new Logger(EvolutionService.name);
    private readonly httpClient: AxiosInstance;

    constructor(private readonly configService: ConfigService) {
        this.httpClient = axios.create({
            baseURL: this.getBaseUrl(),
            timeout: Number(
                this.configService.get("EVOLUTION_TIMEOUT_MS", 15000),
            ),
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
        });
    }

    async createInstance(
        instanceName: string,
    ): Promise<EvolutionCreateInstanceResponse> {
        const normalizedName = this.normalizeInstanceName(instanceName);
        const webhookUrl = this.getWebhookUrl();
        const payload: Record<string, unknown> = {
            instanceName: normalizedName,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
        };

        if (webhookUrl) {
            payload.webhook = {
                url: webhookUrl,
                byEvents: false,
                base64: false,
                events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
            };
        }

        this.logger.debug(
            `[createInstance] creating instanceName=${normalizedName}`,
        );

        const response = await this.request<EvolutionCreateInstanceResponse>({
            method: "POST",
            url: "/instance/create",
            data: payload,
        });

        return response.data;
    }

    async getInstanceStatus(
        instanceName: string,
    ): Promise<EvolutionInstanceStatusResponse> {
        const normalizedName = this.normalizeInstanceName(instanceName);

        this.logger.debug(
            `[getInstanceStatus] fetching instanceName=${normalizedName}`,
        );

        const response = await this.request<EvolutionInstanceStatusResponse>({
            method: "GET",
            url: `/instance/connectionState/${encodeURIComponent(normalizedName)}`,
        });

        return response.data;
    }

    async connectInstance(
        instanceName: string,
    ): Promise<EvolutionConnectInstanceResponse> {
        const normalizedName = this.normalizeInstanceName(instanceName);

        this.logger.debug(
            `[connectInstance] requesting qr for instanceName=${normalizedName}`,
        );

        const response = await this.request<EvolutionConnectInstanceResponse>({
            method: "GET",
            url: `/instance/connect/${encodeURIComponent(normalizedName)}`,
        });

        return response.data;
    }

    async logoutInstance(
        instanceName: string,
    ): Promise<EvolutionSuccessMessageResponse> {
        const normalizedName = this.normalizeInstanceName(instanceName);

        this.logger.debug(
            `[logoutInstance] logging out instanceName=${normalizedName}`,
        );

        const response = await this.request<EvolutionSuccessMessageResponse>({
            method: "DELETE",
            url: `/instance/logout/${encodeURIComponent(normalizedName)}`,
        });

        return response.data;
    }

    async deleteInstance(
        instanceName: string,
    ): Promise<EvolutionSuccessMessageResponse> {
        const normalizedName = this.normalizeInstanceName(instanceName);

        this.logger.debug(
            `[deleteInstance] deleting instanceName=${normalizedName}`,
        );

        const response = await this.request<EvolutionSuccessMessageResponse>({
            method: "DELETE",
            url: `/instance/delete/${encodeURIComponent(normalizedName)}`,
        });

        return response.data;
    }

    async sendText(
        instanceName: string,
        input: {
            number: string;
            text: string;
            delay?: number;
            linkPreview?: boolean;
            quoted?: EvolutionQuotedMessage;
        },
    ): Promise<Record<string, unknown>> {
        const normalizedName = this.normalizeInstanceName(instanceName);
        const response = await this.request<Record<string, unknown>>({
            method: "POST",
            url: `/message/sendText/${encodeURIComponent(normalizedName)}`,
            data: {
                number: this.normalizeRecipientNumber(input.number),
                text: input.text,
                delay: input.delay,
                linkPreview: input.linkPreview ?? false,
                ...(input.quoted ? { quoted: input.quoted } : {}),
            },
        });

        return response.data;
    }

    async sendMedia(
        instanceName: string,
        input: {
            number: string;
            media: string;
            mediaType: "image" | "video" | "document";
            mimeType?: string | null;
            fileName?: string | null;
            caption?: string;
            delay?: number;
            quoted?: EvolutionQuotedMessage;
        },
    ): Promise<Record<string, unknown>> {
        const normalizedName = this.normalizeInstanceName(instanceName);
        const response = await this.request<Record<string, unknown>>({
            method: "POST",
            url: `/message/sendMedia/${encodeURIComponent(normalizedName)}`,
            data: {
                number: this.normalizeRecipientNumber(input.number),
                mediatype: input.mediaType,
                mimetype: input.mimeType ?? undefined,
                caption: input.caption ?? "",
                media: input.media,
                fileName: input.fileName ?? undefined,
                delay: input.delay ?? 0,
                linkPreview: false,
                ...(input.quoted ? { quoted: input.quoted } : {}),
            },
        });

        return response.data;
    }

    async sendWhatsAppAudio(
        instanceName: string,
        input: {
            number: string;
            audio: string;
            delay?: number;
            quoted?: EvolutionQuotedMessage;
        },
    ): Promise<Record<string, unknown>> {
        const normalizedName = this.normalizeInstanceName(instanceName);
        const response = await this.request<Record<string, unknown>>({
            method: "POST",
            url: `/message/sendWhatsAppAudio/${encodeURIComponent(normalizedName)}`,
            data: {
                number: this.normalizeRecipientNumber(input.number),
                audio: input.audio,
                delay: input.delay ?? 0,
                linkPreview: false,
                ...(input.quoted ? { quoted: input.quoted } : {}),
            },
        });

        return response.data;
    }

    async sendPresence(
        instanceName: string,
        input: {
            number: string;
            presence: "composing" | "paused" | "recording";
            delay?: number;
        },
    ): Promise<void> {
        const normalizedName = this.normalizeInstanceName(instanceName);
        await this.request<void>({
            method: "POST",
            url: `/chat/sendPresence/${encodeURIComponent(normalizedName)}`,
            data: {
                number: this.normalizeRecipientNumber(input.number),
                delay: input.delay ?? 0,
                presence: input.presence,
            },
        }, {
            suppressErrorLog: true,
        });
    }

    async markMessageAsRead(
        instanceName: string,
        input: {
            remoteJid: string;
            id: string;
        },
    ): Promise<void> {
        const normalizedName = this.normalizeInstanceName(instanceName);
        await this.request<void>({
            method: "POST",
            url: `/chat/markMessageAsRead/${encodeURIComponent(normalizedName)}`,
            data: {
                readMessages: [
                    {
                        remoteJid: input.remoteJid,
                        fromMe: false,
                        id: input.id,
                    },
                ],
            },
        }, {
            suppressErrorLog: true,
        });
    }

    async getBase64FromMediaMessage(
        instanceName: string,
        input: {
            messageId: string;
            convertToMp4?: boolean;
        },
    ): Promise<unknown> {
        const normalizedName = this.normalizeInstanceName(instanceName);
        const normalizedMessageId = input.messageId.trim();

        if (!normalizedMessageId) {
            throw new BadRequestException("messageId must be provided");
        }

        const response = await this.request<unknown>({
            method: "POST",
            url: `/chat/getBase64FromMediaMessage/${encodeURIComponent(normalizedName)}`,
            data: {
                message: {
                    key: {
                        id: normalizedMessageId,
                    },
                },
                convertToMp4: input.convertToMp4 ?? false,
            },
        });

        return response.data;
    }

    isNotFoundError(error: unknown): boolean {
        return this.isAxiosStatus(error, 404);
    }

    isConflictError(error: unknown): boolean {
        return this.isAxiosStatus(error, 409);
    }

    private async request<T>(
        config: AxiosRequestConfig,
        options?: {
            suppressErrorLog?: boolean;
        },
    ): Promise<AxiosResponse<T>> {
        try {
            return await this.httpClient.request<T>({
                ...config,
                headers: {
                    ...config.headers,
                    apikey: this.getApiKey(),
                },
            });
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status ?? "unknown";
                const responseBody =
                    error.response?.data &&
                    typeof error.response.data === "object"
                        ? JSON.stringify(error.response.data)
                        : String(error.response?.data ?? "");

                if (!options?.suppressErrorLog) {
                    this.logger.error(
                        `[request] Evolution API falhou method=${config.method ?? "GET"} url=${config.url ?? "/"} status=${status} body=${responseBody}`,
                    );
                }

                const normalizedMessage =
                    this.extractApiErrorMessage(error.response?.data) ??
                    error.message;

                throw new BadRequestException(
                    `Evolution API rejected request: ${normalizedMessage}`,
                );
            }

            throw error;
        }
    }

    private getBaseUrl(): string {
        const baseUrl =
            this.configService.get<string>("EVOLUTION_API_URL")?.trim() ||
            this.configService.get<string>("EVOLUTION_BASE_URL")?.trim() ||
            "http://localhost:8081";

        return baseUrl.replace(/\/$/, "");
    }

    private getWebhookUrl(): string | null {
        const explicitUrl =
            this.configService.get<string>("EVOLUTION_WEBHOOK_URL")?.trim() ||
            this.configService.get<string>("MY_APP_WEBHOOK_URL")?.trim();

        if (explicitUrl) {
            return explicitUrl;
        }

        const nestApiUrl = this.configService.get<string>("NEST_API_URL")?.trim();

        if (!nestApiUrl) {
            return null;
        }

        return `${nestApiUrl.replace(/\/$/, "")}/webhooks/evolution`;
    }

    private getApiKey(): string {
        const apiKey = this.configService
            .get<string>("EVOLUTION_API_KEY")
            ?.trim();

        if (!apiKey) {
            throw new InternalServerErrorException(
                "EVOLUTION_API_KEY is not configured",
            );
        }

        return apiKey;
    }

    private normalizeInstanceName(instanceName: string): string {
        const normalizedName = instanceName.trim();

        if (!normalizedName) {
            throw new BadRequestException(
                "instanceName must be provided",
            );
        }

        return normalizedName;
    }

    private extractApiErrorMessage(payload: unknown): string | null {
        if (!payload || typeof payload !== "object") {
            return null;
        }

        const candidate = payload as Record<string, unknown>;
        const possibleValues = [
            candidate.message,
            candidate.error,
            candidate.response,
            candidate.details,
        ];

        for (const value of possibleValues) {
            if (typeof value === "string" && value.trim()) {
                return value.trim();
            }
        }

        return null;
    }

    private isAxiosStatus(error: unknown, status: number): boolean {
        if (!axios.isAxiosError(error)) {
            return false;
        }

        return (error as AxiosError).response?.status === status;
    }

    private normalizeRecipientNumber(value: string): string {
        const normalized = value.replace(/@.*$/, "").replace(/\D+/g, "").trim();

        if (!normalized) {
            throw new BadRequestException(
                "Recipient number must be provided",
            );
        }

        return normalized;
    }
}
