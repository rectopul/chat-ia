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
var TemplateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const telegram_service_1 = require("../telegram/services/telegram.service");
const client_1 = require("@prisma/client");
let TemplateService = TemplateService_1 = class TemplateService {
    constructor(prisma, telegram) {
        this.prisma = prisma;
        this.telegram = telegram;
        this.logger = new common_1.Logger(TemplateService_1.name);
    }
    async sendTemplate(botId, chatId, templateId) {
        const template = await this.prisma.messageTemplate.findUnique({
            where: { id: templateId },
            include: { mediaItems: true },
        });
        if (!template)
            throw new Error(`Template não encontrado: ${templateId}`);
        if (!template.isActive)
            throw new Error(`Template inativo: ${templateId}`);
        await this.telegram.sendTemplate(botId, chatId, template);
    }
    async scheduleCampaignsForUser(botId, telegramUserId, chatId, segment) {
        const rules = await this.prisma.timedMessageRule.findMany({
            where: { botId, segment, isActive: true },
        });
        if (rules.length === 0)
            return 0;
        const now = new Date();
        await this.prisma.scheduledMessageJob.createMany({
            data: rules.map((rule) => ({
                botId,
                telegramUserId,
                chatId,
                templateId: rule.templateId,
                ruleId: rule.id,
                runAt: new Date(now.getTime() + rule.delaySeconds * 1000),
                status: client_1.JobStatus.PENDING,
            })),
            skipDuplicates: true,
        });
        this.logger.log(`${rules.length} job(s) agendados para user ${telegramUserId} (segmento: ${segment})`);
        return rules.length;
    }
    async processScheduledJobs() {
        const jobs = await this.prisma.scheduledMessageJob.findMany({
            where: {
                status: client_1.JobStatus.PENDING,
                runAt: { lte: new Date() },
            },
            include: {
                template: { include: { mediaItems: true } },
            },
            take: 50,
            orderBy: { runAt: "asc" },
        });
        if (jobs.length === 0)
            return { processed: 0, failed: 0 };
        this.logger.log(`Processando ${jobs.length} job(s)...`);
        const MAX_ATTEMPTS = 3;
        let processed = 0;
        let failed = 0;
        for (const job of jobs) {
            try {
                await this.telegram.sendTemplate(job.botId, job.chatId, job.template);
                await this.prisma.scheduledMessageJob.update({
                    where: { id: job.id },
                    data: { status: client_1.JobStatus.SENT, sentAt: new Date() },
                });
                this.logger.log(`Job ${job.id} enviado.`);
                processed++;
                const rule = await this.prisma.timedMessageRule.findFirst({
                    where: {
                        id: job.ruleId,
                        isActive: true,
                        repeatIntervalSeconds: { not: null },
                    },
                });
                if (rule?.repeatIntervalSeconds) {
                    await this.prisma.scheduledMessageJob.create({
                        data: {
                            botId: job.botId,
                            telegramUserId: job.telegramUserId,
                            chatId: job.chatId,
                            templateId: job.templateId,
                            ruleId: rule.id,
                            runAt: new Date(Date.now() + rule.repeatIntervalSeconds * 1000),
                            status: client_1.JobStatus.PENDING,
                        },
                    });
                }
            }
            catch (error) {
                this.logger.error(`Erro no job ${job.id}: ${error.message}`);
                const isFinal = job.attempts + 1 >= MAX_ATTEMPTS;
                failed++;
                await this.prisma.scheduledMessageJob.update({
                    where: { id: job.id },
                    data: {
                        attempts: { increment: 1 },
                        status: isFinal ? client_1.JobStatus.FAILED : client_1.JobStatus.PENDING,
                        lastError: error.message ?? String(error),
                    },
                });
            }
        }
        return { processed, failed };
    }
};
exports.TemplateService = TemplateService;
exports.TemplateService = TemplateService = TemplateService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        telegram_service_1.TelegramService])
], TemplateService);
//# sourceMappingURL=template.service.js.map