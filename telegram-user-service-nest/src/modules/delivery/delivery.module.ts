import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { OrderEventsModule } from "../order-events/order-events.module";
import { DeliveryOrderService } from "./delivery-order.service";
import { ProductService } from "./product.service";
import { TagService } from "./tag.service";
import { TemporaryCartService } from "./temporary-cart.service";

@Module({
    imports: [PrismaModule, OrderEventsModule],
    providers: [
        ProductService,
        TagService,
        TemporaryCartService,
        DeliveryOrderService,
    ],
    exports: [
        ProductService,
        TagService,
        TemporaryCartService,
        DeliveryOrderService,
    ],
})
export class DeliveryModule {}
