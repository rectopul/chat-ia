import { Logger } from "@nestjs/common";
import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    WebSocketGateway,
    WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import {
    ORDER_FINALIZED_EVENT,
    ORDER_UPDATED_EVENT,
    OrderDashboardCard,
} from "./order-events.types";

@WebSocketGateway({
    namespace: "/orders",
    cors: {
        origin: "*",
        credentials: true,
    },
})
export class OrderEventsGateway
    implements OnGatewayConnection, OnGatewayDisconnect
{
    private readonly logger = new Logger(OrderEventsGateway.name);

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

    emitOrderFinalized(order: OrderDashboardCard): void {
        const ownerRoom = this.getOrderRoom(order);

        if (!ownerRoom) {
            return;
        }

        this.server.to(ownerRoom).emit(ORDER_FINALIZED_EVENT, order);
        this.logger.debug(
            `[emitOrderFinalized] orderId=${order.id} status=${order.status}`,
        );
    }

    emitOrderUpdated(order: OrderDashboardCard): void {
        const ownerRoom = this.getOrderRoom(order);

        if (!ownerRoom) {
            return;
        }

        this.server.to(ownerRoom).emit(ORDER_UPDATED_EVENT, order);
        this.logger.debug(
            `[emitOrderUpdated] orderId=${order.id} status=${order.status}`,
        );
    }

    private getOrderRoom(order: OrderDashboardCard): string | null {
        if (!order.ownerUserId) {
            this.logger.warn(
                `[getOrderRoom] pedido sem ownerUserId orderId=${order.id}`,
            );
            return null;
        }

        return this.getOwnerRoom(order.ownerUserId);
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
