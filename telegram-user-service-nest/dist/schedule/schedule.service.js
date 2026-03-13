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
const telegram_service_1 = require("../telegram/telegram.service");
let ScheduleService = ScheduleService_1 = class ScheduleService {
    constructor(prisma, telegram) {
        this.prisma = prisma;
        this.telegram = telegram;
        this.logger = new common_1.Logger(ScheduleService_1.name);
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
            const users = await this.prisma.telegramUser.findMany({
                where: { botId: schedule.botId, isBlocked: false },
                select: {
                    chatId: true,
                    telegramUserId: true,
                    isSubscriber: true,
                },
            });
            this.logger.log(`Schedule "${schedule.template.title}" → ${users.length} usuário(s) no bot ${schedule.bot.name}`);
            for (const user of users) {
                try {
                    const templateKey = schedule.template.key;
                    let shouldSend = false;
                    if (templateKey === "SUBSCRIBER_CONTENT") {
                        shouldSend = user.isSubscriber;
                    }
                    else {
                        shouldSend = true;
                    }
                    if (shouldSend) {
                        await this.telegram.sendTemplate(schedule.botId, user.chatId, schedule.template);
                        fired++;
                        await new Promise((r) => setTimeout(r, 50));
                    }
                }
                catch (err) {
                    this.logger.error(`Erro ao enviar para user ${user.chatId}: ${err.message}`);
                    errors++;
                }
            }
        }
        return { fired, errors };
    }
};
exports.ScheduleService = ScheduleService;
exports.ScheduleService = ScheduleService = ScheduleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        telegram_service_1.TelegramService])
], ScheduleService);
//# sourceMappingURL=schedule.service.js.map