import { Injectable } from "@nestjs/common";
import { OrderEventsGateway } from "./order-events.gateway";
import {
    mapOrderToDashboardCard,
    RealtimeOrderRecord,
} from "./order-events.types";

@Injectable()
export class OrderEventsService {
    constructor(private readonly gateway: OrderEventsGateway) {}

    emitOrderFinalized(order: RealtimeOrderRecord): void {
        this.gateway.emitOrderFinalized(mapOrderToDashboardCard(order));
    }

    emitOrderUpdated(order: RealtimeOrderRecord): void {
        this.gateway.emitOrderUpdated(mapOrderToDashboardCard(order));
    }
}
