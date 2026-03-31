// schedule/schedule.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RecurringSchedule, MessageTemplate } from "@prisma/client";
import { TelegramService } from "src/telegram/services/telegram.service";
import { SchedulerService } from "src/telegram/services/scheduler.service";
import { RuntimeRegistryProvider } from "src/telegram/providers/runtime-registry.provider";

@Injectable()
export class ScheduleService {
    private readonly logger = new Logger(ScheduleService.name);
    private readonly scheduledJobsLockTtlSeconds = this.getEnvNumber(
        "SCHEDULED_JOBS_LOCK_TTL_SECONDS",
        55,
    );
    private readonly recurringSchedulesLockTtlSeconds = this.getEnvNumber(
        "RECURRING_SCHEDULES_LOCK_TTL_SECONDS",
        55,
    );
    private readonly recurringBatchSize = this.getEnvNumber(
        "RECURRING_SCHEDULE_BATCH_SIZE",
        250,
    );
    private readonly recurringSendDelayMs = this.getEnvNumber(
        "RECURRING_SCHEDULE_SEND_DELAY_MS",
        50,
    );

    constructor(
        private readonly prisma: PrismaService,
        private readonly telegramService: TelegramService,
        private readonly schedulerService: SchedulerService,
        private readonly runtimeRegistry: RuntimeRegistryProvider,
    ) {}

    async processJobs(): Promise<{ processed: number; failed: number }> {
        const locked = await this.runtimeRegistry.runWithLock(
            "scheduled-jobs",
            this.scheduledJobsLockTtlSeconds,
            () => this.schedulerService.processJobs(),
        );

        if (!locked.acquired) {
            this.logger.warn(
                `[processJobs] execução ignorada: outra instância já está processando scheduled jobs`,
            );
            return { processed: 0, failed: 0 };
        }

        return locked.result ?? { processed: 0, failed: 0 };
    }

    /**
     * Chamado externamente (via Vercel Cron a cada minuto).
     * Verifica quais RecurringSchedules devem rodar agora (hora + minuto + dia da semana)
     * e dispara o template para todos os usuários ativos do bot.
     */
    async processRecurringSchedules(): Promise<{
        fired: number;
        errors: number;
    }> {
        const locked = await this.runtimeRegistry.runWithLock(
            "recurring-schedules",
            this.recurringSchedulesLockTtlSeconds,
            async () => {
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const currentWeekDay = now.getDay(); // 0 = domingo, 6 = sábado

                // Busca schedules que batem com hora + minuto + dia da semana atual
                const schedules = await this.prisma.recurringSchedule.findMany({
                    where: {
                        isActive: true,
                        hour: currentHour,
                        minute: currentMinute,
                    },
                    include: {
                        template: { include: { mediaItems: true } },
                        bot: true,
                    },
                });

                // Filtra pelo dia da semana (campo weekDays é array de Int no Prisma)
                const due = schedules.filter((s) =>
                    s.weekDays.includes(currentWeekDay),
                );

                if (due.length === 0) {
                    this.logger.debug(
                        `Nenhum schedule para ${currentHour}:${String(currentMinute).padStart(2, "0")} dia ${currentWeekDay}`,
                    );
                    return { fired: 0, errors: 0 };
                }

                this.logger.log(`${due.length} schedule(s) para disparar agora.`);

                let fired = 0;
                let errors = 0;

                for (const schedule of due) {
                    if (!schedule.bot.isActive) continue;
                    if (!schedule.template.isActive) continue;

                    const scheduleResult =
                        await this.processRecurringSchedule(schedule);
                    fired += scheduleResult.fired;
                    errors += scheduleResult.errors;
                }

                return { fired, errors };
            },
        );

        if (!locked.acquired) {
            this.logger.warn(
                `[processRecurringSchedules] execução ignorada: outra instância já está processando schedules recorrentes`,
            );
            return { fired: 0, errors: 0 };
        }

        return locked.result ?? { fired: 0, errors: 0 };
    }

    private async processRecurringSchedule(
        schedule: RecurringSchedule & {
            template: MessageTemplate & { mediaItems: any[] };
            bot: { name: string; isActive: boolean };
        },
    ): Promise<{ fired: number; errors: number }> {
        let fired = 0;
        let errors = 0;
        let offset = 0;
        let batchNumber = 0;

        this.logger.log(
            `[processRecurringSchedules] scheduleId=${schedule.id} botId=${schedule.botId} template="${schedule.template.title}"`,
        );

        while (true) {
            const users = await this.prisma.telegramUser.findMany({
                where: { botId: schedule.botId, isBlocked: false },
                select: {
                    chatId: true,
                    telegramUserId: true,
                    isSubscriber: true,
                },
                orderBy: { chatId: "asc" },
                skip: offset,
                take: this.recurringBatchSize,
            });

            if (!users.length) break;

            batchNumber++;
            this.logger.debug(
                `[processRecurringSchedules] scheduleId=${schedule.id} lote=${batchNumber} size=${users.length} offset=${offset}`,
            );

            for (const user of users) {
                try {
                    if (!this.shouldSendRecurringTemplate(schedule.template.key, user.isSubscriber)) {
                        continue;
                    }

                    await this.telegramService.sendTemplate(
                        schedule.botId,
                        user.chatId,
                        schedule.template,
                    );
                    fired++;

                    if (this.recurringSendDelayMs > 0) {
                        await this.sleep(this.recurringSendDelayMs);
                    }
                } catch (err: any) {
                    errors++;
                    this.logger.error(
                        `[processRecurringSchedules] scheduleId=${schedule.id} chatId=${user.chatId} falhou: ${this.getErrorMessage(err)}`,
                        err?.stack,
                    );
                }
            }

            offset += users.length;
        }

        this.logger.log(
            `[processRecurringSchedules] scheduleId=${schedule.id} concluído: fired=${fired} errors=${errors}`,
        );

        return { fired, errors };
    }

    private shouldSendRecurringTemplate(
        templateKey: string | null,
        isSubscriber: boolean,
    ): boolean {
        if (templateKey === "SUBSCRIBER_CONTENT") {
            return isSubscriber;
        }

        return true;
    }

    private getEnvNumber(name: string, fallback: number): number {
        const value = Number(process.env[name]);
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        return String(error);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
