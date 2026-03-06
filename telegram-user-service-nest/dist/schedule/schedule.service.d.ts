import { PrismaService } from "../prisma/prisma.service";
import { TelegramService } from "../telegram/telegram.service";
export declare class ScheduleService {
    private readonly prisma;
    private readonly telegram;
    private readonly logger;
    constructor(prisma: PrismaService, telegram: TelegramService);
    processRecurringSchedules(): Promise<{
        fired: number;
        errors: number;
    }>;
}
