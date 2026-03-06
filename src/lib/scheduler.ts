import { prisma } from "@/lib/prisma";
import { MessageTemplateKey, UserSegment, JobStatus } from "@prisma/client";
import { TelegramService } from "./telegram";

export async function scheduleCampaignsForUser(
    botId: string,
    telegramUserId: string,
    chatId: string,
    segment: UserSegment,
) {
    const rules = await prisma.timedMessageRule.findMany({
        where: {
            botId,
            segment,
            isActive: true,
        },
        include: {
            template: true,
        },
    });

    const now = new Date();

    const jobs = rules.map((rule) => ({
        botId,
        telegramUserId,
        chatId,
        templateId: rule.templateId,
        runAt: new Date(now.getTime() + rule.delaySeconds * 1000),
        status: JobStatus.PENDING,
        ruleId: rule.id,
    }));

    if (jobs.length > 0) {
        await prisma.scheduledMessageJob.createMany({
            data: jobs,
        });
    }
}

export async function processScheduledJobs() {
    const jobs = await prisma.scheduledMessageJob.findMany({
        where: {
            status: JobStatus.PENDING,
            runAt: {
                lte: new Date(),
            },
        },
        include: {
            bot: true,
            template: {
                include: {
                    mediaItems: true,
                },
            },
        },
        take: 50,
    });

    for (let index = 0; index < jobs.length; index++) {
        const job = jobs[index];

        try {
            await TelegramService.sendMessageTemplate(
                job.chatId,
                job.telegramUserId,
                job.template,
                job.botId,
                job.bot.token || undefined,
            );

            await TelegramService.sendMessageTemplate(
                job.chatId,
                job.telegramUserId,
                job.template,
                job.botId,
                job.bot.token ?? " ",
            );

            await prisma.scheduledMessageJob.update({
                where: { id: job.id },
                data: {
                    status: JobStatus.SENT,
                    sentAt: new Date(),
                },
            });
            // Handle recurring messages
            const rule = await prisma.timedMessageRule.findFirst({
                where: {
                    botId: job.botId,
                    templateId: job.templateId,
                    isActive: true,
                    repeatIntervalSeconds: { not: null },
                },
            });

            if (rule && rule.repeatIntervalSeconds) {
                await prisma.scheduledMessageJob.create({
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
            console.error(`Error processing job ${job.id}:`, error);

            const maxAttempts = 3;
            const newStatus =
                job.attempts + 1 >= maxAttempts
                    ? JobStatus.FAILED
                    : JobStatus.PENDING;

            await prisma.scheduledMessageJob.update({
                where: { id: job.id },
                data: {
                    status: newStatus,
                    lastError: error.message || String(error),
                },
            });
        }
    }

    return jobs.length;
}
