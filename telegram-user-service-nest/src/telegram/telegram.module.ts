// src/telegram/telegram.module.ts

import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SyncPayModule } from "../syncpay/syncpay.module";
import { AiAgentModule } from "../modules/ai-agent/ai-agent.module";

// Providers
import { MtprotoProvider } from "./providers/mtproto.provider";
import { BotApiProvider } from "./providers/bot-api.provider";
import { RuntimeRegistryProvider } from "./providers/runtime-registry.provider";

// Services
import { MediaService } from "./services/media.service";
import { SessionService } from "./services/session.service";
import { TemplateService } from "./services/template.service"; // ← era "src/template/template.service", agora aponta para o serviço correto
import { SchedulerService } from "./services/scheduler.service";
import { BusinessBotService } from "./services/business-bot.service";
import { TelegramService } from "./services/telegram.service";

// telegram/telegram.module.ts
import { BullModule } from "@nestjs/bullmq";

// Controller (mantém o mesmo)
import { TelegramController } from "./telegram.controller";
import { QUEUE_NAME, TRANSFER_QUEUE_NAME } from "./constants";
import { MessageProcessor } from "./processors/message.processor";
import { GroupScraperService } from "./services/group-scraper.service";
import { TransferProcessor } from "./processors/transfer.processor";
import { ScraperController } from "./controllers/scraper.controller";
import { ChatActionService } from "./services/chat-action.service";
import { forwardRef } from "@nestjs/common";

@Module({
    imports: [
        // Registro da fila de mensagens
        BullModule.registerQueue({
            name: QUEUE_NAME,
        }),

        // Fila de transferências (nova)
        BullModule.registerQueue({
            name: TRANSFER_QUEUE_NAME,
        }),

        PrismaModule,
        SyncPayModule,
        forwardRef(() => AiAgentModule),
    ],
    providers: [
        // Providers (camada de infraestrutura)
        MtprotoProvider,
        BotApiProvider,
        RuntimeRegistryProvider,

        // Services (camada de negócio)
        ChatActionService,
        MediaService,
        SessionService,
        TemplateService,
        SchedulerService,
        BusinessBotService,
        GroupScraperService,

        // Fachada principal
        TelegramService,

        // Worker da fila
        MessageProcessor,
        TransferProcessor,
    ],
    exports: [
        TelegramService,
        SchedulerService,
        RuntimeRegistryProvider,
        BotApiProvider,
        MtprotoProvider,
        ChatActionService,
        TemplateService,
    ],
    controllers: [TelegramController, ScraperController],
})
export class TelegramModule {}
