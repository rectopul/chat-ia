"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var SyncPayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncPayService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const SYNCPAY_API_URL = "https://api.syncpayments.com.br";
let cachedToken = null;
let tokenExpiry = 0;
let SyncPayService = SyncPayService_1 = class SyncPayService {
    constructor() {
        this.logger = new common_1.Logger(SyncPayService_1.name);
        this.http = axios_1.default.create({
            baseURL: SYNCPAY_API_URL,
            timeout: 30_000,
            headers: { "Content-Type": "application/json" },
        });
    }
    async getToken() {
        if (cachedToken && Date.now() < tokenExpiry) {
            return cachedToken;
        }
        const clientId = process.env.SYNCPAY_CLIENT_ID;
        const clientSecret = process.env.SYNCPAY_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new Error("SYNCPAY_CLIENT_ID e SYNCPAY_CLIENT_SECRET são obrigatórios");
        }
        try {
            const { data } = await this.http.post("/api/partner/v1/auth-token", {
                client_id: clientId,
                client_secret: clientSecret,
            });
            this.logger.debug("[RESPOSTA SYNCPAY GERAÇÃO DE TOKEN]: ", JSON.stringify(data));
            if (!data.access_token) {
                throw new Error("access_token não encontrado na resposta do auth");
            }
            cachedToken = data.access_token;
            tokenExpiry = Date.now() + ((data.expires_in ?? 3600) - 300) * 1000;
            this.logger.log("SyncPay token obtido com sucesso");
            return cachedToken;
        }
        catch (err) {
            cachedToken = null;
            tokenExpiry = 0;
            this.logger.error("SyncPay Auth Error:", err.response?.data ?? err.message);
            throw err;
        }
    }
    async createCharge(input) {
        const token = await this.getToken();
        const client = input.client ?? {
            name: "Cliente",
            cpf: process.env.SYNCPAY_DEFAULT_CPF ?? "00000000000",
            email: process.env.SYNCPAY_DEFAULT_EMAIL ?? "cliente@exemplo.com",
            phone: process.env.SYNCPAY_DEFAULT_PHONE ?? "11999999999",
        };
        const body = {
            amount: input.amountCents / 100,
            description: input.productTitle,
            client: {
                name: client.name,
                email: client.email,
                cpf: client.cpf.replace(/\D/g, ""),
                phone: client.phone.replace(/\D/g, ""),
            },
            webhook_url: `${process.env.SYNCPAY_WEBHOOK_URL}/api/syncpay/webhook`,
            external_reference: input.referenceId,
        };
        this.logger.log(`[SyncPay] Cash-in R$ ${body.amount} — ${input.productTitle}`);
        try {
            const { data } = await this.http.post("/api/partner/v1/cash-in", body, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!data.pix_code || !data.identifier) {
                throw new Error(`Resposta inesperada do SyncPay: ${JSON.stringify(data)}`);
            }
            this.logger.log(`[SyncPay] PIX gerado — identifier=${data.identifier}`);
            return {
                identifier: data.identifier,
                pix_code: data.pix_code,
            };
        }
        catch (err) {
            this.logger.error("SyncPay Cash-In Error:", err.response?.data ?? err.message);
            throw err;
        }
    }
    processCashInWebhook(payload) {
        const data = payload?.data;
        if (!data?.status || !data?.id || !data?.amount) {
            return {
                success: false,
                message: "Payload inválido: campos obrigatórios ausentes",
            };
        }
        if (!SyncPayService_1.SUCCESS_STATUSES.includes(data.status)) {
            this.logger.log(`[SyncPay webhook] status não-sucesso: ${data.status} — id: ${data.id}`);
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
};
exports.SyncPayService = SyncPayService;
SyncPayService.SUCCESS_STATUSES = [
    "PAGO",
    "APROVADO",
    "PAGAMENTO_APROVADO",
    "COMPLETED",
    "PAID_OUT",
    "completed",
];
exports.SyncPayService = SyncPayService = SyncPayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], SyncPayService);
//# sourceMappingURL=syncpay.service.js.map