export const WHATSAPP_INSTANCE_STATUS_EVENT = "whatsapp:instance-status";

export type WhatsappInstanceStatusEvent = {
    instanceId: string;
    instanceName: string;
    status: string;
    previousStatus: string | null;
    reason?: string | null;
    changedAt: string;
};
