import { prisma } from "@/lib/prisma";
import { TelegramUserClient } from "./client";
import { TelegramService } from "@/lib/telegram";

export async function processRecurringSchedules() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDay = now.getDay();

  const schedules = await prisma.recurringSchedule.findMany({
    where: {
      hour: currentHour,
      minute: currentMinute,
      isActive: true,
      weekDays: { has: currentDay }
    },
    include: {
      bot: true,
      template: {
        include: { mediaItems: true }
      }
    }
  });

  for (const schedule of schedules) {
    const users = await prisma.telegramUser.findMany({
        where: { botId: schedule.botId }
    });

    for (const user of users) {
        try {
            if (schedule.bot.isUserAccount) {
                const client = new TelegramUserClient(schedule.botId);
                await client.sendTemplate(user.chatId, schedule.template);
            } else {
                await TelegramService.sendMessageTemplate(
                    user.chatId,
                    user.telegramUserId,
                    schedule.template,
                    schedule.botId,
                    schedule.bot.token || undefined
                );
            }
        } catch (error) {
            console.error(`Error sending recurring message to ${user.telegramUserId}:`, error);
        }
    }
  }
}
