import { BullModule } from "@nestjs/bullmq";
import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SyncPayModule } from "../../syncpay/syncpay.module";
import { TelegramModule } from "../../telegram/telegram.module";
import {
    AI_RESPONSE_QUEUE_NAME,
    AiAgentService,
} from "./ai-agent.service";
import { AiAgentProcessor } from "./ai-agent.processor";
import { AiAgentRepository } from "./ai-agent.repository";
import { AiAgentCommerceService } from "./ai-agent-commerce.service";

@Module({
    imports: [
        BullModule.registerQueue({
            name: AI_RESPONSE_QUEUE_NAME,
        }),
        PrismaModule,
        SyncPayModule,
        forwardRef(() => TelegramModule),
    ],
    providers: [
        AiAgentRepository,
        AiAgentService,
        AiAgentCommerceService,
        AiAgentProcessor,
    ],
    exports: [AiAgentService, AiAgentRepository, AiAgentCommerceService],
})
export class AiAgentModule {}
