"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { getPublicNestApiBaseUrl } from "@/lib/nest-api";
import {
    WHATSAPP_INSTANCE_STATUS_EVENT,
    WhatsappInstanceStatusEvent,
} from "@/lib/whatsapp-events";

type WhatsappStatusListenerProps = {
    userId: string;
};

function buildStatusMessage(event: WhatsappInstanceStatusEvent): {
    title: string;
    description: string;
    tone: "success" | "error" | "info";
} {
    const normalizedStatus = event.status.toUpperCase();

    if (normalizedStatus === "CONNECTED") {
        return {
            title: "WhatsApp conectado",
            description: `A instancia ${event.instanceName} foi conectada com sucesso.`,
            tone: "success",
        };
    }

    if (normalizedStatus === "DISCONNECTED") {
        return {
            title: "WhatsApp desconectado",
            description: event.reason
                ? `A instancia ${event.instanceName} ficou offline: ${event.reason}.`
                : `A instancia ${event.instanceName} ficou offline e precisa de nova verificacao.`,
            tone: "error",
        };
    }

    return {
        title: "Status do WhatsApp atualizado",
        description: `A instancia ${event.instanceName} agora esta em ${event.status}.`,
        tone: "info",
    };
}

export default function WhatsappStatusListener({
    userId,
}: WhatsappStatusListenerProps) {
    const router = useRouter();
    const lastEventKeyRef = useRef<string | null>(null);

    useEffect(() => {
        const baseUrl = getPublicNestApiBaseUrl();

        if (!baseUrl || !userId) {
            return;
        }

        const socket: Socket = io(`${baseUrl}/whatsapp-events`, {
            transports: ["websocket", "polling"],
            withCredentials: true,
            auth: {
                userId,
            },
        });

        const handleStatusEvent = (event: WhatsappInstanceStatusEvent) => {
            const eventKey = `${event.instanceId}:${event.status}:${event.changedAt}`;

            if (lastEventKeyRef.current === eventKey) {
                return;
            }

            lastEventKeyRef.current = eventKey;

            const message = buildStatusMessage(event);

            if (message.tone === "success") {
                toast.success(message.title, {
                    description: message.description,
                });
            } else if (message.tone === "error") {
                toast.error(message.title, {
                    description: message.description,
                });
            } else {
                toast.info(message.title, {
                    description: message.description,
                });
            }

            router.refresh();
        };

        socket.on(WHATSAPP_INSTANCE_STATUS_EVENT, handleStatusEvent);

        return () => {
            socket.off(WHATSAPP_INSTANCE_STATUS_EVENT, handleStatusEvent);
            socket.disconnect();
        };
    }, [router, userId]);

    return null;
}
