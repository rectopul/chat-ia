import { Module } from "@nestjs/common";
import { TelegramController } from "./telegram/telegram.controller";
import { TelegramService } from "./telegram/telegram.service";
import { PrismaService } from "./prisma/prisma.service";
import { ConfigModule } from "@nestjs/config";
import { TemplateController } from "./template/template.controller";
import { TemplateService } from "./template/template.service";
import { ScheduleModule } from "./schedule/schedule.module";
import { TelegramModule } from "./telegram/telegram.module";
import { SyncPayModule } from "./syncpay/syncpay.module";
import { TemplateModule } from "./template/template.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            // Ele tentará carregar o .env.local primeiro; se não achar, carrega o .env
            envFilePath: [".env.local", ".env"],
            isGlobal: true,
        }),
        ScheduleModule,
        TelegramModule,
        SyncPayModule,
        TemplateModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
