import { PrismaService } from "../prisma/prisma.service";
import { TelegramService } from "src/telegram/services/telegram.service";
import { SchedulerService } from "src/telegram/services/scheduler.service";
export declare class ScheduleService {
    private readonly prisma;
    private readonly telegramService;
    private readonly schedulerService;
    private readonly logger;
    private readonly recurringBatchSize;
    private readonly recurringSendDelayMs;
    constructor(prisma: PrismaService, telegramService: TelegramService, schedulerService: SchedulerService);
    processJobs(): Promise<{
        processed: number;
        failed: number;
    }>;
    processRecurringSchedules(): Promise<{
        fired: number;
        errors: number;
    }>;
    private processRecurringSchedule;
    private shouldSendRecurringTemplate;
    private getEnvNumber;
    private getErrorMessage;
    private sleep;
}
