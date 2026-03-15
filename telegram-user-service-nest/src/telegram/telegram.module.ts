// telegram/telegram.module.ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SyncPayModule } from "src/syncpay/syncpay.module";
import { TelegramController } from "./telegram.controller";
import { MtprotoProvider } from "./providers/mtproto.provider";
import { BotApiProvider } from "./providers/bot-api.provider";
import { MediaService } from "./services/media.service";
import { SessionService } from "./services/session.service";
import { TemplateService } from "src/template/template.service";
import { SchedulerService } from "./services/scheduler.service";
import { BusinessBotService } from "./services/business-bot.service";
import { TelegramService } from "./services/telegram.service";

@Module({
    imports: [PrismaModule, SyncPayModule],
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
    ],
    controllers: [TelegramController],
    exports: [TelegramService],
})
export class TelegramModule {}
