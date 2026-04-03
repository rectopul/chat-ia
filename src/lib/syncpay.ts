import axios from "axios";
import crypto from "crypto";

const SYNCPAY_API_URL = "https://api.syncpayments.com.br"; // Use correct base URL from docs if available, assuming .com.br or provided
const CLIENT_ID = process.env.SYNCPAY_CLIENT_ID;
const CLIENT_SECRET = process.env.SYNCPAY_CLIENT_SECRET;
const STATIC_KEY =
    process.env.SYNCPAY_STATIC_KEY || "01K1259MAXE0TNRXV2C2WQN2MV";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

export class SyncPayService {
    private static async getAuthToken() {
        if (cachedToken && Date.now() < tokenExpiry) {
            return cachedToken;
        }

        try {
            const response = await axios.post(
                `${SYNCPAY_API_URL}/api/partner/v1/auth-token`,
                {
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    [STATIC_KEY]: STATIC_KEY, // The docs show this odd key
                },
            );

            cachedToken = response.data.access_token;
            // expires_in is usually in seconds. Be safe and subtract 5 mins.
            tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;

            return cachedToken;
        } catch (error) {
            console.error("SyncPay Auth Error:", error);
            throw error;
        }
    }

    static async createPixCharge(params: {
        amount: number;
        description: string;
        webhook_url: string;
        client: {
            name: string;
            cpf: string;
            email: string;
            phone: string;
        };
    }) {
        const token = await this.getAuthToken();

        try {
            const response = await axios.post(
                `${SYNCPAY_API_URL}/api/partner/v1/cash-in`,
                params,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                    },
                },
            );

            return response.data; // { message, pix_code, identifier }
        } catch (error: any) {
            console.error(
                "SyncPay Cash-In Error:",
                error.response?.data || error.message,
            );
            throw error;
        }
    }

    // Legacy/Mock for compatibility if needed, but updated for real flow
    static async createCharge(params: {
        amountCents: number;
        referenceId: string;
        productTitle: string;
        client?: any;
    }) {
        // This now calls the real PIX generation
        const webhookUrl = `${process.env.APP_BASE_URL}/api/syncpay/webhook`;

        const result = await this.createPixCharge({
            amount: params.amountCents / 100,
            description: params.productTitle,
            webhook_url: webhookUrl,
            client: params.client || {
                name: "Cliente Telegram",
                cpf: "00000000000",
                email: "cliente@exemplo.com",
                phone: "00000000000",
            },
        });

        return {
            id: result.identifier,
            pix_code: result.pix_code,
            checkoutUrl: result.pix_code, // For PIX we return the code directly
        };
    }

    static verifyWebhookSignature(payload: string, signature: string) {
        const secret = process.env.SYNCPAY_WEBHOOK_SECRET;
        if (!secret) return false;

        // The docs don't explicitly mention the signature algorithm for the new webhook,
        // but the provided "token" in creation response suggests it might be used.
        // Assuming standard HMAC-SHA256 as previously implemented until clarified.
        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(payload)
            .digest("hex");

        return expectedSignature === signature;
    }
}
