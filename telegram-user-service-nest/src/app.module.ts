import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "./schedule/schedule.module";
import { TelegramModule } from "./telegram/telegram.module";
import { SyncPayModule } from "./syncpay/syncpay.module";
import { TemplateModule } from "./template/template.module";
import { BullModule } from "@nestjs/bullmq";
import { BullBoardModule } from "@bull-board/nestjs";
import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { QUEUE_NAME, TRANSFER_QUEUE_NAME } from "./telegram/constants";
import {
    WHATSAPP_INCOMING_QUEUE_NAME,
    WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME,
    WHATSAPP_OUTGOING_QUEUE_NAME,
} from "./whatsapp/queue/constants/whatsapp-queue.constants";
import { WhatsappModule } from "./whatsapp/whatsapp.module";
import { AiAgentModule } from "./modules/ai-agent/ai-agent.module";
import { AI_RESPONSE_QUEUE_NAME } from "./modules/ai-agent/ai-agent.service";
import { SubscriptionModule } from "./modules/subscription/subscription.module";
import { BillingModule } from "./modules/billing/billing.module";
import { DeliveryModule } from "./modules/delivery/delivery.module";
import { AdminModule } from "./modules/admin/admin.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { EvolutionModule } from "./modules/evolution/evolution.module";
import { OperatingHoursModule } from "./modules/operating-hours/operating-hours.module";

@Module({
    imports: [
        // Conexão global com Redis
        BullModule.forRoot({
            connection: {
                host: process.env.REDIS_HOST ?? "localhost",
                port: Number(process.env.REDIS_PORT ?? 6379),
            }, // seu Redis
        }),

        // Bull Board — expõe o dashboard em /admin/queues
        BullBoardModule.forRoot({
            route: "/admin/queues", // URL do dashboard
            adapter: ExpressAdapter,
        }),

        // Registra a fila do Telegram no dashboard
        BullBoardModule.forFeature({
            name: QUEUE_NAME,
            adapter: BullMQAdapter,
        }),

        // Registra a fila do Scrapper no dashboard
        BullBoardModule.forFeature({
            name: TRANSFER_QUEUE_NAME,
            adapter: BullMQAdapter,
        }),

        BullBoardModule.forFeature({
            name: AI_RESPONSE_QUEUE_NAME,
            adapter: BullMQAdapter,
        }),

        BullBoardModule.forFeature({
            name: WHATSAPP_INCOMING_QUEUE_NAME,
            adapter: BullMQAdapter,
        }),

        BullBoardModule.forFeature({
            name: WHATSAPP_OUTGOING_QUEUE_NAME,
            adapter: BullMQAdapter,
        }),

        BullBoardModule.forFeature({
            name: WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME,
            adapter: BullMQAdapter,
        }),

        ConfigModule.forRoot({
            // Ele tentará carregar o .env.local primeiro; se não achar, carrega o .env
            envFilePath: [".env.local", ".env"],
            isGlobal: true,
        }),
        ScheduleModule,
        TelegramModule,
        AiAgentModule,
        SubscriptionModule,
        BillingModule,
        DeliveryModule,
        OrdersModule,
        AdminModule,
        EvolutionModule,
        OperatingHoursModule,
        SyncPayModule,
        TemplateModule,
        WhatsappModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
