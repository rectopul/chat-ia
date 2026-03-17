// template/template.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TelegramService } from "../telegram/services/telegram.service";
import { JobStatus, UserSegment } from "@prisma/client";

@Injectable()
export class TemplateService {
    private readonly logger = new Logger(TemplateService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly telegram: TelegramService,
    ) {}

    // ─────────────────────────────────────────────────────────────────────
    // Envio direto de template
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Envia um template imediatamente para um chat específico.
     */
    async sendTemplate(
        botId: string,
        chatId: string,
        templateId: string,
    ): Promise<void> {
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

    // ─────────────────────────────────────────────────────────────────────
    // Agendamento de campanhas para um usuário
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Cria jobs agendados para todas as regras ativas que se aplicam
     * ao segmento do usuário.
     */
    async scheduleCampaignsForUser(
        botId: string,
        telegramUserId: string,
        chatId: string,
        segment: UserSegment,
    ): Promise<number> {
        const rules = await this.prisma.timedMessageRule.findMany({
            where: { botId, segment, isActive: true },
        });

        if (rules.length === 0) return 0;

        const now = new Date();

        await this.prisma.scheduledMessageJob.createMany({
            data: rules.map((rule) => ({
                botId,
                telegramUserId,
                chatId,
                templateId: rule.templateId,
                ruleId: rule.id,
                runAt: new Date(now.getTime() + rule.delaySeconds * 1000),
                status: JobStatus.PENDING,
            })),
            skipDuplicates: true,
        });

        this.logger.log(
            `${rules.length} job(s) agendados para user ${telegramUserId} (segmento: ${segment})`,
        );

        return rules.length;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Processamento de jobs — chamado via HTTP externamente
    // (ex: Vercel Cron, Railway Cron, cURL agendado, etc.)
    // ─────────────────────────────────────────────────────────────────────

    async processScheduledJobs(): Promise<{
        processed: number;
        failed: number;
    }> {
        const jobs = await this.prisma.scheduledMessageJob.findMany({
            where: {
                status: JobStatus.PENDING,
                runAt: { lte: new Date() },
            },
            include: {
                template: { include: { mediaItems: true } },
            },
            take: 50,
            orderBy: { runAt: "asc" },
        });

        if (jobs.length === 0) return { processed: 0, failed: 0 };

        this.logger.log(`Processando ${jobs.length} job(s)...`);

        const MAX_ATTEMPTS = 3;
        let processed = 0;
        let failed = 0;

        for (const job of jobs) {
            try {
                await this.telegram.sendTemplate(
                    job.botId,
                    job.chatId,
                    job.template,
                );

                await this.prisma.scheduledMessageJob.update({
                    where: { id: job.id },
                    data: { status: JobStatus.SENT, sentAt: new Date() },
                });

                this.logger.log(`Job ${job.id} enviado.`);
                processed++;

                // Recria o job se a regra tiver repeatIntervalSeconds
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
                            runAt: new Date(
                                Date.now() + rule.repeatIntervalSeconds * 1000,
                            ),
                            status: JobStatus.PENDING,
                        },
                    });
                }
            } catch (error: any) {
                this.logger.error(`Erro no job ${job.id}: ${error.message}`);

                const isFinal = job.attempts + 1 >= MAX_ATTEMPTS;
                failed++;

                await this.prisma.scheduledMessageJob.update({
                    where: { id: job.id },
                    data: {
                        attempts: { increment: 1 },
                        status: isFinal ? JobStatus.FAILED : JobStatus.PENDING,
                        lastError: error.message ?? String(error),
                    },
                });
            }
        }

        return { processed, failed };
    }
}
