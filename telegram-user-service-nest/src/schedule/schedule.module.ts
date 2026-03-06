// schedule/schedule.module.ts
import { Module } from "@nestjs/common";
import { ScheduleService } from "./schedule.service";
import { ScheduleController } from "./schedule.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { TelegramModule } from "../telegram/telegram.module";

@Module({
    imports: [PrismaModule, TelegramModule],
    controllers: [ScheduleController],
    providers: [ScheduleService],
})
export class ScheduleModule {}
