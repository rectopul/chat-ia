import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { WhatsappModule } from "../../whatsapp/whatsapp.module";
import { OrderEventsModule } from "../order-events/order-events.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
    imports: [PrismaModule, WhatsappModule, OrderEventsModule],
    controllers: [OrdersController],
    providers: [OrdersService],
})
export class OrdersModule {}
