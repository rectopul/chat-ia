// schedule/schedule.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TelegramService } from "../telegram/telegram.service";

@Injectable()
export class ScheduleService {
    private readonly logger = new Logger(ScheduleService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly telegram: TelegramService,
    ) {}

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
                        await this.telegram.sendTemplate(
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
