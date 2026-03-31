import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";

const SYNCPAY_API_URL = "https://api.syncpayments.com.br";

// Cache do token em memória
let cachedToken: string | null = null;
let tokenExpiry = 0;
let warnedAboutLegacyEnvNames = false;

export interface CreatePixChargeInput {
    /** Valor em centavos (ex: 4999 = R$ 49,99) */
    amountCents: number;
    /** Título/descrição do produto */
    productTitle: string;
    /** ID de referência (ex: chatId do cliente) */
    referenceId: string;
    /** Dados do cliente — se não informado usa dados genéricos */
    client?: {
        name: string;
        cpf: string;
        email: string;
        phone: string;
    };
}

export interface PixChargeResult {
    /** ID da transação no SyncPay */
    identifier: string;
    /** Código PIX copia e cola */
    pix_code: string;
}

@Injectable()
export class SyncPayService {
    private readonly logger = new Logger(SyncPayService.name);

    private readonly http: AxiosInstance;

    constructor() {
        this.http = axios.create({
            baseURL: SYNCPAY_API_URL,
            timeout: 30_000,
            headers: { "Content-Type": "application/json" },
        });
    }

    getConfigStatus(): {
        isConfigured: boolean;
        clientId: string | null;
        clientSecret: string | null;
        usingLegacyNames: boolean;
        missing: string[];
    } {
        const clientId =
            process.env.SYNCPAY_CLIENT_ID ?? process.env.SYNCPAY_API_KEY ?? null;
        const clientSecret =
            process.env.SYNCPAY_CLIENT_SECRET ?? process.env.SYNCPAY_TOKEN ?? null;

        const usingLegacyNames =
            (!process.env.SYNCPAY_CLIENT_ID && !!process.env.SYNCPAY_API_KEY) ||
            (!process.env.SYNCPAY_CLIENT_SECRET && !!process.env.SYNCPAY_TOKEN);

        const missing: string[] = [];
        if (!clientId) missing.push("SYNCPAY_CLIENT_ID");
        if (!clientSecret) missing.push("SYNCPAY_CLIENT_SECRET");

        return {
            isConfigured: !!clientId && !!clientSecret,
            clientId,
            clientSecret,
            usingLegacyNames,
            missing,
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // Auth
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Obtém o Bearer token, usando cache se ainda válido.
     * Baseado no PHP: POST /api/partner/v1/auth-token com client_id + client_secret apenas.
     */
    private async getToken(): Promise<string> {
        if (cachedToken && Date.now() < tokenExpiry) {
            return cachedToken;
        }

        const config = this.getConfigStatus();
        const { clientId, clientSecret } = config;

        if (config.usingLegacyNames && !warnedAboutLegacyEnvNames) {
            warnedAboutLegacyEnvNames = true;
            this.logger.warn(
                "Usando nomes legados do SyncPay (SYNCPAY_API_KEY/SYNCPAY_TOKEN). Prefira SYNCPAY_CLIENT_ID/SYNCPAY_CLIENT_SECRET.",
            );
        }

        if (!clientId || !clientSecret) {
            throw new Error(
                `SyncPay não configurado. Variáveis obrigatórias ausentes: ${config.missing.join(", ")}`,
            );
        }

        try {
            const { data } = await this.http.post(
                "/api/partner/v1/auth-token",
                {
                    client_id: clientId,
                    client_secret: clientSecret,
                    // ✅ apenas estes dois campos — o PHP não envia nada mais
                },
            );

            this.logger.debug(
                "[RESPOSTA SYNCPAY GERAÇÃO DE TOKEN]: ",
                JSON.stringify(data),
            );

            if (!data.access_token) {
                throw new Error(
                    "access_token não encontrado na resposta do auth",
                );
            }

            cachedToken = data.access_token;
            // expires_in em segundos, subtrai 5 minutos de margem
            tokenExpiry = Date.now() + ((data.expires_in ?? 3600) - 300) * 1000;

            this.logger.log("SyncPay token obtido com sucesso");
            return cachedToken!;
        } catch (err: any) {
            cachedToken = null;
            tokenExpiry = 0;
            this.logger.error(
                "SyncPay Auth Error:",
                err.response?.data ?? err.message,
            );
            throw err;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Cash In (PIX)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Gera uma cobrança PIX.
     *
     * Baseado no PHP cashIn():
     *   POST /api/partner/v1/cash-in
     *   Body: { amount, description, client: { name, email, cpf, phone } }
     *   Retorno: { pix_code, identifier }
     */
    async createCharge(input: CreatePixChargeInput): Promise<PixChargeResult> {
        const token = await this.getToken();

        // Dados do cliente — em produção deve vir do cadastro do usuário
        const client = input.client ?? {
            name: "Cliente",
            cpf: process.env.SYNCPAY_DEFAULT_CPF ?? "00000000000",
            email: process.env.SYNCPAY_DEFAULT_EMAIL ?? "cliente@exemplo.com",
            phone: process.env.SYNCPAY_DEFAULT_PHONE ?? "11999999999",
        };

        const body = {
            amount: input.amountCents / 100, // API recebe em reais, não centavos
            description: input.productTitle,
            client: {
                name: client.name,
                email: client.email,
                cpf: client.cpf.replace(/\D/g, ""),
                phone: client.phone.replace(/\D/g, ""),
            },
            // webhook para receber confirmação de pagamento
            webhook_url: `${process.env.SYNCPAY_WEBHOOK_URL}/api/syncpay/webhook`,
            // referência externa para correlacionar no webhook
            external_reference: input.referenceId,
        };

        this.logger.log(
            `[SyncPay] Cash-in R$ ${body.amount} — ${input.productTitle}`,
        );

        try {
            const { data } = await this.http.post(
                "/api/partner/v1/cash-in",
                body,
                {
                    headers: { Authorization: `Bearer ${token}` },
                },
            );

            if (!data.pix_code || !data.identifier) {
                throw new Error(
                    `Resposta inesperada do SyncPay: ${JSON.stringify(data)}`,
                );
            }

            this.logger.log(
                `[SyncPay] PIX gerado — identifier=${data.identifier}`,
            );

            return {
                identifier: data.identifier,
                pix_code: data.pix_code,
            };
        } catch (err: any) {
            this.logger.error(
                "SyncPay Cash-In Error:",
                err.response?.data ?? err.message,
            );
            throw err;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Webhook helpers
    // ─────────────────────────────────────────────────────────────────────

    private static readonly SUCCESS_STATUSES = [
        "PAGO",
        "APROVADO",
        "PAGAMENTO_APROVADO",
        "COMPLETED",
        "PAID_OUT",
        "completed",
    ];

    /**
     * Processa o payload recebido no webhook de cash-in.
     * Retorna { success, transactionId, status, amount } se pago.
     */
    processCashInWebhook(payload: any): {
        success: boolean;
        transactionId?: string;
        status?: string;
        amount?: number;
        message: string;
    } {
        const data = payload?.data;

        if (!data?.status || !data?.id || !data?.amount) {
            return {
                success: false,
                message: "Payload inválido: campos obrigatórios ausentes",
            };
        }

        if (!SyncPayService.SUCCESS_STATUSES.includes(data.status)) {
            this.logger.log(
                `[SyncPay webhook] status não-sucesso: ${data.status} — id: ${data.id}`,
            );
            return {
                success: false,
                transactionId: data.id,
                status: data.status,
                message: `Status não é de pagamento confirmado: ${data.status}`,
            };
        }

        return {
            success: true,
            transactionId: data.id,
            status: data.status,
            amount: data.amount,
            message: "Pagamento confirmado",
        };
    }
}
