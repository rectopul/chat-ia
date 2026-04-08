import { fetchNestApiJson } from "@/lib/nest-api";

type TenantHeaders = HeadersInit;

export type WhatsappConnectResponse = {
    id: string;
    userId: string;
    instanceName: string;
    status: string;
    webhookUrl: string | null;
    createdAt: string;
    updatedAt: string;
};

export type WhatsappQrCodeResponse = {
    instanceId: string;
    instanceName: string;
    status: string;
    qrCodeBase64: string | null;
    pairingCode: string | null;
};

function buildTenantHeaders(userId: string): TenantHeaders {
    return {
        "x-user-id": userId,
    };
}

export async function connectWhatsappInstance(
    userId: string,
): Promise<WhatsappConnectResponse> {
    return fetchNestApiJson<WhatsappConnectResponse>("/whatsapp/connect", {
        method: "POST",
        headers: buildTenantHeaders(userId),
    });
}

export async function getWhatsappQrCode(
    userId: string,
): Promise<WhatsappQrCodeResponse> {
    return fetchNestApiJson<WhatsappQrCodeResponse>("/whatsapp/qr-code", {
        method: "GET",
        headers: buildTenantHeaders(userId),
    });
}
