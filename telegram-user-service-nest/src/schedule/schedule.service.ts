// schedule/schedule.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JobStatus, SaleStatus } from "@prisma/client";
import { TelegramService } from "src/telegram/services/telegram.service";

@Injectable()
export class ScheduleService {
    private readonly logger = new Logger(ScheduleService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly telegramService: TelegramService,
    ) {}

    async processJobs(): Promise<{ processed: number; failed: number }> {
        const jobs = await this.prisma.scheduledMessageJob.findMany({
            where: {
                status: JobStatus.PENDING,
                runAt: { lte: new Date() },
            },
            include: {
                template: { include: { mediaItems: true } },
                rule: true,
                user: true,
            },
            orderBy: { runAt: "asc" },
            take: 50,
        });

        if (!jobs.length) return { processed: 0, failed: 0 };

        this.logger.log(`[processJobs] Processando ${jobs.length} jobs...`);

        let processed = 0;
        let failed = 0;

        for (const job of jobs) {
            // Marca imediatamente para evitar processamento duplo
            await this.prisma.scheduledMessageJob.update({
                where: { id: job.id },
                data: { attempts: { increment: 1 } },
            });

            try {
                // ── 1. Verifica se já comprou ─────────────────────────────
                const hasPurchased = await this.prisma.sale.findFirst({
                    where: {
                        telegramUserId: job.telegramUserId,
                        status: SaleStatus.PAID,
                    },
                });

                if (hasPurchased) {
                    this.logger.debug(
                        `[processJobs] Job ${job.id} cancelado — usuário ${job.telegramUserId} já comprou`,
                    );
                    await this.prisma.scheduledMessageJob.update({
                        where: { id: job.id },
                        data: { status: JobStatus.CANCELED },
                    });
                    processed++;
                    continue;
                }

                // ── 2. Resolve token e connection ─────────────────────────
                //
                // O job.botId é sempre um BotAccount válido (FK garantida).
                // O token está no mapa em memória pelo mesmo botId.
                // A BusinessConnection é buscada pelo chatId do usuário — pois
                // o chatId foi registrado em chatConnectionMap durante a conversa.

                const token = this.telegramService.getBusinessBotToken(
                    job.botId,
                );

                // Busca a connection pelo chatId (mais preciso) ou pelo botId
                const connection =
                    await this.prisma.businessConnection.findFirst({
                        where: {
                            isEnabled: true,
                            OR: [
                                { botId: job.botId },
                                // Fallback: qualquer connection ativa
                            ],
                        },
                        orderBy: { createdAt: "desc" },
                    });

                if (!token) {
                    throw new Error(
                        `Token não encontrado em memória para botId=${job.botId}. ` +
                            `O servidor pode ter reiniciado — o bot precisa receber uma mensagem para recarregar o token.`,
                    );
                }

                if (!connection) {
                    throw new Error(
                        `BusinessConnection não encontrada para botId=${job.botId}`,
                    );
                }

                const businessCtx = {
                    token,
                    businessConnectionId: connection.connectionId,
                    botId: job.botId,
                };

                // ── 3. Envia o template ───────────────────────────────────
                await this.telegramService.sendTemplate(
                    job.botId,
                    job.chatId,
                    job.template,
                    businessCtx,
                );

                // ── 4. Envia o menu de desconto/produtos ──────────────────
                await this.telegramService.sendDontSellMenu(
                    job.botId,
                    job.chatId,
                    token,
                    connection.connectionId,
                );

                // ── 5. Marca como enviado ─────────────────────────────────
                await this.prisma.scheduledMessageJob.update({
                    where: { id: job.id },
                    data: { status: JobStatus.SENT, sentAt: new Date() },
                });

                processed++;
                this.logger.log(
                    `[processJobs] Job ${job.id} enviado para chatId=${job.chatId}`,
                );
            } catch (err: any) {
                failed++;
                this.logger.error(
                    `[processJobs] Job ${job.id} falhou: ${err?.message}`,
                );
                await this.prisma.scheduledMessageJob.update({
                    where: { id: job.id },
                    data: {
                        status: JobStatus.FAILED,
                        lastError: err?.message ?? "Erro desconhecido",
                    },
                });
            }

            await new Promise((r) => setTimeout(r, 200));
        }

        this.logger.log(
            `[processJobs] Concluído: ${processed} processados, ${failed} falhas`,
        );

        return { processed, failed };
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

            // Busca todos os usuários ativos do bot
            const users = await this.prisma.telegramUser.findMany({
                where: { botId: schedule.botId, isBlocked: false },
                select: {
                    chatId: true,
                    telegramUserId: true,
                    isSubscriber: true,
                },
            });

            this.logger.log(
                `Schedule "${schedule.template.title}" → ${users.length} usuário(s) no bot ${schedule.bot.name}`,
            );

            for (const user of users) {
                try {
                    const templateKey = schedule.template.key;
                    let shouldSend = false;

                    // 1. Define quem deve receber o quê
                    if (templateKey === "SUBSCRIBER_CONTENT") {
                        shouldSend = user.isSubscriber;
                    } else {
                        shouldSend = true; // Templates gerais (ex: Manutenção, Aviso Geral)
                    }

                    // 2. Executa o envio
                    if (shouldSend) {
                        await this.telegramService.sendTemplate(
                            schedule.botId,
                            user.chatId,
                            schedule.template,
                        );
                        fired++;

                        // Delay apenas se houver envio real para respeitar o rate limit
                        await new Promise((r) => setTimeout(r, 50));
                    }
                } catch (err: any) {
                    this.logger.error(
                        `Erro ao enviar para user ${user.chatId}: ${err.message}`,
                    );
                    errors++;
                }
            }
        }

        return { fired, errors };
    }
}
