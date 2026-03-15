-- DropForeignKey
ALTER TABLE "ScheduledMessageJob" DROP CONSTRAINT "ScheduledMessageJob_telegramUserId_botId_fkey";

-- DropForeignKey
ALTER TABLE "TimedMessageRule" DROP CONSTRAINT "TimedMessageRule_botId_fkey";

-- DropForeignKey
ALTER TABLE "TimedMessageRule" DROP CONSTRAINT "TimedMessageRule_templateId_fkey";

-- AddForeignKey
ALTER TABLE "TimedMessageRule" ADD CONSTRAINT "TimedMessageRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimedMessageRule" ADD CONSTRAINT "TimedMessageRule_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_telegramUserId_botId_fkey" FOREIGN KEY ("telegramUserId", "botId") REFERENCES "TelegramUser"("telegramUserId", "botId") ON DELETE CASCADE ON UPDATE CASCADE;
