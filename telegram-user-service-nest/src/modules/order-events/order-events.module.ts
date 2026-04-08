import { Module } from "@nestjs/common";
import { OrderEventsGateway } from "./order-events.gateway";
import { OrderEventsService } from "./order-events.service";

@Module({
    providers: [OrderEventsGateway, OrderEventsService],
    exports: [OrderEventsService],
})
export class OrderEventsModule {}
