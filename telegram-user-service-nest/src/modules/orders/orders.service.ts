import {
    BadRequestException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { WhatsappQueueService } from "../../whatsapp/queue/services/whatsapp-queue.service";
import { OrderEventsService } from "../order-events/order-events.service";
import {
    mapOrderToDashboardCard,
    orderRealtimeInclude,
    OrderDashboardCard,
} from "../order-events/order-events.types";

const SHIPPED_MESSAGE =
    "Seu pedido saiu para entrega com o motoboy!";

@Injectable()
export class OrdersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly whatsappQueueService: WhatsappQueueService,
        private readonly orderEventsService: OrderEventsService,
    ) {}

    async listDashboardOrders(userId?: string): Promise<OrderDashboardCard[]> {
        const ownerUserId = this.requireOwnerUserId(userId);
        const orders = await this.prisma.order.findMany({
            where: {
                ownerUserId,
                status: {
                    in: [OrderStatus.PREPARING, OrderStatus.SHIPPED],
                },
            },
            include: orderRealtimeInclude,
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 100,
        });

        return orders.map(mapOrderToDashboardCard);
    }

    async sendOrderToDelivery(
        orderId: string,
        userId?: string,
    ): Promise<OrderDashboardCard> {
        const ownerUserId = this.requireOwnerUserId(userId);
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                ownerUserId,
            },
            include: orderRealtimeInclude,
        });

        if (!order) {
            throw new NotFoundException(`Order "${orderId}" not found`);
        }

        if (order.status === OrderStatus.DELIVERED) {
            throw new BadRequestException(
                "Pedido ja foi marcado como entregue",
            );
        }

        if (order.status === OrderStatus.SHIPPED) {
            return mapOrderToDashboardCard(order);
        }

        if (!order.whatsappInstanceId) {
            throw new BadRequestException(
                "Pedido nao possui instancia do WhatsApp vinculada",
            );
        }

        await this.whatsappQueueService.enqueueOutgoingMessage({
            instanceId: order.whatsappInstanceId,
            chatId: order.customerWhatsappId,
            text: SHIPPED_MESSAGE,
            messageType: "TEXT",
            payload: {
                source: "delivery-dashboard",
                orderId: order.id,
            },
        });

        const updatedOrder = await this.prisma.order.update({
            where: { id: order.id },
            data: {
                status: OrderStatus.SHIPPED,
            },
            include: orderRealtimeInclude,
        });

        this.orderEventsService.emitOrderUpdated(updatedOrder);

        return mapOrderToDashboardCard(updatedOrder);
    }

    private requireOwnerUserId(userId?: string): string {
        const normalizedUserId = userId?.trim();

        if (!normalizedUserId) {
            throw new UnauthorizedException(
                "Usuario do tenant nao informado para listar os pedidos",
            );
        }

        return normalizedUserId;
    }
}
