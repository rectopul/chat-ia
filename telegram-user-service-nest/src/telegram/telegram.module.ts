// telegram/telegram.module.ts
import { Module } from "@nestjs/common";
import { TelegramService } from "./telegram.service";
import { PrismaModule } from "../prisma/prisma.module";
import { SyncPayModule } from "src/syncpay/syncpay.module";

@Module({
    imports: [PrismaModule, SyncPayModule],
    providers: [TelegramService],
    exports: [TelegramService],
})
export class TelegramModule {}
