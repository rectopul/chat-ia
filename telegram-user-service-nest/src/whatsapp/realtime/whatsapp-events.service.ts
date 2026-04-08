import { Injectable } from "@nestjs/common";
import { WhatsappEventsGateway } from "./whatsapp-events.gateway";
import { WhatsappInstanceStatusEvent } from "./whatsapp-events.types";

@Injectable()
export class WhatsappEventsService {
    constructor(private readonly gateway: WhatsappEventsGateway) {}

    emitInstanceStatusChanged(
        ownerUserId: string,
        payload: WhatsappInstanceStatusEvent,
    ): void {
        this.gateway.emitInstanceStatusChanged(ownerUserId, payload);
    }
}
