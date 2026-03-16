// src/telegram/telegram.module.ts

import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SyncPayModule } from "../syncpay/syncpay.module";

// Providers
import { MtprotoProvider } from "./providers/mtproto.provider";
import { BotApiProvider } from "./providers/bot-api.provider";

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
import { QUEUE_NAME } from "./constants";
import { MessageProcessor } from "./processors/message.processor";

@Module({
    imports: [
        // Registro da fila de mensagens
        BullModule.registerQueue({
            name: QUEUE_NAME,
        }),

        PrismaModule,
        SyncPayModule,
    ],
    providers: [
        // Providers (camada de infraestrutura)
        MtprotoProvider,
        BotApiProvider,

        // Services (camada de negócio)
        MediaService,
        SessionService,
        TemplateService,
        SchedulerService,
        BusinessBotService,

        // Fachada principal
        TelegramService,

        // Worker da fila
        MessageProcessor,
    ],
    exports: [TelegramService],
    controllers: [TelegramController],
})
export class TelegramModule {}
