// src/telegram/services/scheduler.service.ts
//
// Responsabilidade única: agendamento e processamento de ScheduledMessageJobs.

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { MessageTemplateKey, JobStatus, SaleStatus } from "@prisma/client";
import { DONT_SELL_AUTO_RULE_NAME } from "../constants";
import { BotApiProvider } from "../providers/bot-api.provider";
import { TemplateService } from "./template.service";

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);
    private readonly jobBatchSize = this.getEnvNumber(
        "SCHEDULED_JOB_BATCH_SIZE",
        50,
    );
    private readonly jobDelayMs = this.getEnvNumber(
        "SCHEDULED_JOB_SEND_DELAY_MS",
        200,
    );

    constructor(
        private readonly prisma: PrismaService,
        private readonly botApi: BotApiProvider,
        private readonly templateService: TemplateService,
    ) {}

    // ── Agendamento ───────────────────────────────────────────────────────

    async scheduleDontSellJobs(
        botId: string,
        chatId: number,
        userId: number,
        businessConnectionId: string,
    ): Promise<void> {
        const dontSellTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: MessageTemplateKey.DONT_SELL, isActive: true },
        });

        if (!dontSellTemplate) {
            this.logger.debug(
                `[scheduleDontSellJobs] Nenhum template DONT_SELL ativo`,
            );
            return;
        }

        const user = await this.prisma.telegramUser.findUnique({
            where: { chatId: chatId.toString() },
        });
        if (!user) {
            this.logger.warn(
                `[scheduleDontSellJobs] Usuário não encontrado para chatId=${chatId}`,
            );
            return;
        }

        // Busca intervalos pelo botId, com fallback global
        let intervals = await this.prisma.dontSellInterval.findMany({
            where: { botId, isActive: true },
            orderBy: { delaySeconds: "asc" },
        });
        if (!intervals.length) {
            intervals = await this.prisma.dontSellInterval.findMany({
                where: { isActive: true },
                orderBy: { delaySeconds: "asc" },
            });
        }
        if (!intervals.length) {
            this.logger.debug(
                `[scheduleDontSellJobs] Nenhum intervalo DONT_SELL configurado`,
            );
            return;
        }

        // Valida FK — o botId precisa existir em BotAccount
        const botExists = await this.prisma.botAccount.findUnique({
            where: { id: botId },
            select: { id: true },
        });
        if (!botExists) {
            this.logger.error(
                `[scheduleDontSellJobs] botId=${botId} não encontrado em BotAccount`,
            );
            return;
        }

        this.logger.debug(
            `[scheduleDontSellJobs] botId=${botId} connId=${businessConnectionId}`,
        );

        // Busca ou cria a TimedMessageRule de referência para o DONT_SELL
        let rule = await this.prisma.timedMessageRule.findFirst({
            where: { botId, templateId: dontSellTemplate.id },
        });
        if (!rule) {
            rule = await this.prisma.timedMessageRule.findFirst({
                where: { templateId: dontSellTemplate.id },
            });
        }
        if (!rule) {
            rule = await this.prisma.timedMessageRule.create({
                data: {
                    botId,
                    name: DONT_SELL_AUTO_RULE_NAME,
                    templateId: dontSellTemplate.id,
                    delaySeconds: intervals[0].delaySeconds,
                    segment: "NON_BUYERS",
                    isActive: true,
                },
            });
        }

        const now = new Date();
        await this.prisma.scheduledMessageJob.createMany({
            data: intervals.map((interval) => ({
                botId,
                telegramUserId: user.telegramUserId,
                chatId: chatId.toString(),
                templateId: dontSellTemplate.id,
                ruleId: rule!.id,
                runAt: new Date(now.getTime() + interval.delaySeconds * 1000),
                status: "PENDING" as const,
            })),
            skipDuplicates: true,
        });

        this.logger.log(
            `[scheduleDontSellJobs] ${intervals.length} jobs agendados para chatId=${chatId} ` +
                `(botId=${botId}): ${intervals.map((i) => `T+${i.delaySeconds}s`).join(", ")}`,
        );
    }

    // ── Processamento (chamado pela cron) ─────────────────────────────────

    async processJobs(): Promise<{ processed: number; failed: number }> {
        const startedAt = Date.now();
        const jobs = await this.prisma.scheduledMessageJob.findMany({
            where: { status: JobStatus.PENDING, runAt: { lte: new Date() } },
            include: {
                template: { include: { mediaItems: true } },
                rule: true,
                user: true,
            },
            orderBy: { runAt: "asc" },
            take: this.jobBatchSize,
        });

        if (!jobs.length) return { processed: 0, failed: 0 };
        this.logger.log(
            `[processJobs] Processando ${jobs.length} jobs vencidos (batchSize=${this.jobBatchSize})`,
        );

        let processed = 0,
            failed = 0;

        for (const job of jobs) {
            const context = `jobId=${job.id} botId=${job.botId} chatId=${job.chatId}`;

            await this.prisma.scheduledMessageJob.update({
                where: { id: job.id },
                data: { attempts: { increment: 1 } },
            });

            try {
                // Cancela se o usuário já comprou
                const hasPurchased = await this.prisma.sale.findFirst({
                    where: {
                        telegramUserId: job.telegramUserId,
                        status: SaleStatus.PAID,
                    },
                });
                if (hasPurchased) {
                    await this.prisma.scheduledMessageJob.update({
                        where: { id: job.id },
                        data: { status: JobStatus.CANCELED },
                    });
                    processed++;
                    this.logger.debug(
                        `[processJobs] ${context} cancelado: usuário já comprou`,
                    );
                    continue;
                }

                const token = await this.botApi.getToken(job.botId);
                const connection =
                    await this.prisma.businessConnection.findFirst({
                        where: { botId: job.botId, isEnabled: true },
                    });

                if (!token || !connection) {
                    throw new Error(
                        `Token ou connection não encontrado para botId=${job.botId}`,
                    );
                }

                await this.templateService.sendTemplate(
                    job.botId,
                    job.chatId,
                    job.template,
                    {
                        token,
                        businessConnectionId: connection.connectionId,
                        botId: job.botId,
                    },
                );

                await this.templateService.sendDontSellMenu(
                    job.botId,
                    job.chatId,
                    token,
                    connection.connectionId,
                );

                await this.prisma.scheduledMessageJob.update({
                    where: { id: job.id },
                    data: { status: JobStatus.SENT, sentAt: new Date() },
                });

                processed++;
                this.logger.log(`[processJobs] ${context} enviado com sucesso`);
            } catch (err: any) {
                failed++;
                const errorMessage = this.getErrorMessage(err);
                this.logger.error(
                    `[processJobs] ${context} falhou: ${errorMessage}`,
                    err?.stack,
                );
                await this.prisma.scheduledMessageJob.update({
                    where: { id: job.id },
                    data: {
                        status: JobStatus.FAILED,
                        lastError: errorMessage,
                    },
                });
            }

            if (this.jobDelayMs > 0) {
                await this.sleep(this.jobDelayMs);
            }
        }

        this.logger.log(
            `[processJobs] Concluído em ${Date.now() - startedAt}ms: processed=${processed} failed=${failed}`,
        );
        return { processed, failed };
    }

    private getEnvNumber(name: string, fallback: number): number {
        const value = Number(process.env[name]);
        return Number.isFinite(value) && value >= 0 ? value : fallback;
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        return String(error);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
