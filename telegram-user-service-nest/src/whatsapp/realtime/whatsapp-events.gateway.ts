import { Logger } from "@nestjs/common";
import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    WebSocketGateway,
    WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import {
    WHATSAPP_INSTANCE_STATUS_EVENT,
    WhatsappInstanceStatusEvent,
} from "./whatsapp-events.types";

@WebSocketGateway({
    namespace: "/whatsapp-events",
    cors: {
        origin: "*",
        credentials: true,
    },
})
export class WhatsappEventsGateway
    implements OnGatewayConnection, OnGatewayDisconnect
{
    private readonly logger = new Logger(WhatsappEventsGateway.name);

    @WebSocketServer()
    server!: Server;

    handleConnection(client: Socket): void {
        const userId = this.extractUserId(client);

        if (!userId) {
            this.logger.warn(
                `[handleConnection] socket desconectado por falta de userId clientId=${client.id}`,
            );
            client.disconnect(true);
            return;
        }

        client.join(this.getOwnerRoom(userId));
        this.logger.debug(
            `[handleConnection] clientId=${client.id} ownerUserId=${userId}`,
        );
    }

    handleDisconnect(client: Socket): void {
        this.logger.debug(`[handleDisconnect] clientId=${client.id}`);
    }

    emitInstanceStatusChanged(
        ownerUserId: string,
        payload: WhatsappInstanceStatusEvent,
    ): void {
        this.server
            .to(this.getOwnerRoom(ownerUserId))
            .emit(WHATSAPP_INSTANCE_STATUS_EVENT, payload);

        this.logger.debug(
            `[emitInstanceStatusChanged] ownerUserId=${ownerUserId} instanceId=${payload.instanceId} status=${payload.status}`,
        );
    }

    private getOwnerRoom(userId: string): string {
        return `owner:${userId}`;
    }

    private extractUserId(client: Socket): string | null {
        const candidate =
            client.handshake.auth?.userId ?? client.handshake.query?.userId;

        if (typeof candidate !== "string") {
            return null;
        }

        const normalizedUserId = candidate.trim();
        return normalizedUserId || null;
    }
}
