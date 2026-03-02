import { prisma } from "@/lib/prisma";
import { MessageTemplateKey, UserSegment, JobStatus } from "@prisma/client";
import { TelegramService } from "./telegram";

export async function scheduleCampaignsForUser(
  telegramUserId: string,
  chatId: string,
  segment: UserSegment
) {
  const rules = await prisma.timedMessageRule.findMany({
    where: {
      segment,
      isActive: true,
    },
    include: {
      template: true,
    },
  });

  const now = new Date();

  const jobs = rules.map((rule) => ({
    telegramUserId,
    chatId,
    templateId: rule.templateId,
    runAt: new Date(now.getTime() + rule.delaySeconds * 1000),
    status: JobStatus.PENDING,
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
      template: {
        include: {
            mediaItems: true
        }
      },
    },
    take: 50,
  });

  for (const job of jobs) {
    try {
      await prisma.scheduledMessageJob.update({
        where: { id: job.id },
        data: {
          attempts: { increment: 1 },
        },
      });

      await TelegramService.sendMessageTemplate(
        job.chatId,
        job.telegramUserId,
        job.template
      );

      await prisma.scheduledMessageJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.SENT,
          sentAt: new Date(),
        },
      });
    } catch (error: any) {
      console.error(`Error processing job ${job.id}:`, error);

      const maxAttempts = 3;
      const newStatus = job.attempts + 1 >= maxAttempts ? JobStatus.FAILED : JobStatus.PENDING;

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
