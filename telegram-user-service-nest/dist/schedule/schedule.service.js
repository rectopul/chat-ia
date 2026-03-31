"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ScheduleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const telegram_service_1 = require("../telegram/services/telegram.service");
const scheduler_service_1 = require("../telegram/services/scheduler.service");
let ScheduleService = ScheduleService_1 = class ScheduleService {
    constructor(prisma, telegramService, schedulerService) {
        this.prisma = prisma;
        this.telegramService = telegramService;
        this.schedulerService = schedulerService;
        this.logger = new common_1.Logger(ScheduleService_1.name);
        this.recurringBatchSize = this.getEnvNumber("RECURRING_SCHEDULE_BATCH_SIZE", 250);
        this.recurringSendDelayMs = this.getEnvNumber("RECURRING_SCHEDULE_SEND_DELAY_MS", 50);
    }
    async processJobs() {
        return this.schedulerService.processJobs();
    }
    async processRecurringSchedules() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentWeekDay = now.getDay();
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
        const due = schedules.filter((s) => s.weekDays.includes(currentWeekDay));
        if (due.length === 0) {
            this.logger.debug(`Nenhum schedule para ${currentHour}:${String(currentMinute).padStart(2, "0")} dia ${currentWeekDay}`);
            return { fired: 0, errors: 0 };
        }
        this.logger.log(`${due.length} schedule(s) para disparar agora.`);
        let fired = 0;
        let errors = 0;
        for (const schedule of due) {
            if (!schedule.bot.isActive)
                continue;
            if (!schedule.template.isActive)
                continue;
            const scheduleResult = await this.processRecurringSchedule(schedule);
            fired += scheduleResult.fired;
            errors += scheduleResult.errors;
        }
        return { fired, errors };
    }
    async processRecurringSchedule(schedule) {
        let fired = 0;
        let errors = 0;
        let offset = 0;
        let batchNumber = 0;
        this.logger.log(`[processRecurringSchedules] scheduleId=${schedule.id} botId=${schedule.botId} template="${schedule.template.title}"`);
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
            if (!users.length)
                break;
            batchNumber++;
            this.logger.debug(`[processRecurringSchedules] scheduleId=${schedule.id} lote=${batchNumber} size=${users.length} offset=${offset}`);
            for (const user of users) {
                try {
                    if (!this.shouldSendRecurringTemplate(schedule.template.key, user.isSubscriber)) {
                        continue;
                    }
                    await this.telegramService.sendTemplate(schedule.botId, user.chatId, schedule.template);
                    fired++;
                    if (this.recurringSendDelayMs > 0) {
                        await this.sleep(this.recurringSendDelayMs);
                    }
                }
                catch (err) {
                    errors++;
                    this.logger.error(`[processRecurringSchedules] scheduleId=${schedule.id} chatId=${user.chatId} falhou: ${this.getErrorMessage(err)}`, err?.stack);
                }
            }
            offset += users.length;
        }
        this.logger.log(`[processRecurringSchedules] scheduleId=${schedule.id} concluído: fired=${fired} errors=${errors}`);
        return { fired, errors };
    }
    shouldSendRecurringTemplate(templateKey, isSubscriber) {
        if (templateKey === "SUBSCRIBER_CONTENT") {
            return isSubscriber;
        }
        return true;
    }
    getEnvNumber(name, fallback) {
        const value = Number(process.env[name]);
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }
    getErrorMessage(error) {
        if (error instanceof Error)
            return error.message;
        return String(error);
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.ScheduleService = ScheduleService;
exports.ScheduleService = ScheduleService = ScheduleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        telegram_service_1.TelegramService,
        scheduler_service_1.SchedulerService])
], ScheduleService);
//# sourceMappingURL=schedule.service.js.map