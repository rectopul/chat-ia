import { Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { OrdersService } from "./orders.service";

@Controller("delivery/orders")
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) {}

    @Get("dashboard")
    async getDashboardOrders(@Headers("x-user-id") userId?: string) {
        return {
            orders: await this.ordersService.listDashboardOrders(userId),
        };
    }

    @Post(":orderId/send-to-delivery")
    sendToDelivery(
        @Param("orderId") orderId: string,
        @Headers("x-user-id") userId?: string,
    ) {
        return this.ordersService.sendOrderToDelivery(orderId, userId);
    }
}
