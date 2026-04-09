import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AiAgentModule } from "../modules/ai-agent/ai-agent.module";
import { DeliveryModule } from "../modules/delivery/delivery.module";
import { EvolutionModule } from "../modules/evolution/evolution.module";
import { OperatingHoursModule } from "../modules/operating-hours/operating-hours.module";
import { SubscriptionModule } from "../modules/subscription/subscription.module";
import { PrismaModule } from "../prisma/prisma.module";
import {
    WHATSAPP_INCOMING_QUEUE_NAME,
    WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME,
    WHATSAPP_OUTGOING_QUEUE_NAME,
} from "./queue/constants/whatsapp-queue.constants";
import { EvolutionWebhookController } from "./api/controllers/evolution-webhook.controller";
import { WhatsappController } from "./api/controllers/whatsapp.controller";
import { WhatsappHandoverService } from "./application/handover/whatsapp-handover.service";
import { WhatsappInstanceService } from "./application/instances/whatsapp-instance.service";
import { EvolutionWebhookService } from "./application/webhooks/evolution-webhook.service";
import { MediaHandlerService } from "./messaging/media-handler.service";
import { WhatsappSenderService } from "./messaging/whatsapp-sender.service";
import { WhatsappIncomingProcessor } from "./queue/processors/whatsapp-incoming.processor";
import { WhatsappMediaProcessor } from "./queue/processors/whatsapp-media.processor";
import { WhatsappOutgoingProcessor } from "./queue/processors/whatsapp-outgoing.processor";
import { WhatsappIncomingDebounceService } from "./queue/services/whatsapp-incoming-debounce.service";
import { WhatsappQueueService } from "./queue/services/whatsapp-queue.service";
import { WhatsappEventsGateway } from "./realtime/whatsapp-events.gateway";
import { WhatsappEventsService } from "./realtime/whatsapp-events.service";

@Module({
    imports: [
        BullModule.registerQueue({
            name: WHATSAPP_INCOMING_QUEUE_NAME,
        }),
        BullModule.registerQueue({
            name: WHATSAPP_OUTGOING_QUEUE_NAME,
        }),
        BullModule.registerQueue({
            name: WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME,
        }),
        PrismaModule,
        AiAgentModule,
        DeliveryModule,
        EvolutionModule,
        OperatingHoursModule,
        SubscriptionModule,
    ],
    controllers: [WhatsappController, EvolutionWebhookController],
    providers: [
        MediaHandlerService,
        WhatsappInstanceService,
        WhatsappQueueService,
        WhatsappIncomingDebounceService,
        WhatsappHandoverService,
        EvolutionWebhookService,
        WhatsappEventsGateway,
        WhatsappEventsService,
        WhatsappIncomingProcessor,
        WhatsappOutgoingProcessor,
        WhatsappMediaProcessor,
        WhatsappSenderService,
    ],
    exports: [
        WhatsappInstanceService,
        WhatsappQueueService,
        WhatsappSenderService,
        MediaHandlerService,
        WhatsappHandoverService,
        WhatsappEventsService,
    ],
})
export class WhatsappModule {}
