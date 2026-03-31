import { PrismaService } from "../prisma/prisma.service";
import { TelegramService } from "src/telegram/services/telegram.service";
import { SchedulerService } from "src/telegram/services/scheduler.service";
import { RuntimeRegistryProvider } from "src/telegram/providers/runtime-registry.provider";
export declare class ScheduleService {
    private readonly prisma;
    private readonly telegramService;
    private readonly schedulerService;
    private readonly runtimeRegistry;
    private readonly logger;
    private readonly scheduledJobsLockTtlSeconds;
    private readonly recurringSchedulesLockTtlSeconds;
    private readonly recurringBatchSize;
    private readonly recurringSendDelayMs;
    constructor(prisma: PrismaService, telegramService: TelegramService, schedulerService: SchedulerService, runtimeRegistry: RuntimeRegistryProvider);
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
