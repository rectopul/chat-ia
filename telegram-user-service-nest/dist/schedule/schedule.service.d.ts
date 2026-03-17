import { PrismaService } from "../prisma/prisma.service";
import { TelegramService } from "src/telegram/services/telegram.service";
export declare class ScheduleService {
    private readonly prisma;
    private readonly telegramService;
    private readonly logger;
    constructor(prisma: PrismaService, telegramService: TelegramService);
    processJobs(): Promise<{
        processed: number;
        failed: number;
    }>;
    processRecurringSchedules(): Promise<{
        fired: number;
        errors: number;
    }>;
}
