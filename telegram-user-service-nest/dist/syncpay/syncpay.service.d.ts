export interface CreatePixChargeInput {
    amountCents: number;
    productTitle: string;
    referenceId: string;
    client?: {
        name: string;
        cpf: string;
        email: string;
        phone: string;
    };
}
export interface PixChargeResult {
    identifier: string;
    pix_code: string;
}
export declare class SyncPayService {
    private readonly logger;
    private readonly http;
    constructor();
    getConfigStatus(): {
        isConfigured: boolean;
        clientId: string | null;
        clientSecret: string | null;
        usingLegacyNames: boolean;
        missing: string[];
    };
    private getToken;
    createCharge(input: CreatePixChargeInput): Promise<PixChargeResult>;
    private getWebhookUrl;
    private static readonly SUCCESS_STATUSES;
    processCashInWebhook(payload: any): {
        success: boolean;
        transactionId?: string;
        status?: string;
        amount?: number;
        message: string;
    };
}
