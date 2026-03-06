-- DropForeignKey
ALTER TABLE "MessageLog" DROP CONSTRAINT "MessageLog_botId_fkey";

-- DropForeignKey
ALTER TABLE "MessageLog" DROP CONSTRAINT "MessageLog_telegramUserId_botId_fkey";

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_telegramUserId_botId_fkey" FOREIGN KEY ("telegramUserId", "botId") REFERENCES "TelegramUser"("telegramUserId", "botId") ON DELETE CASCADE ON UPDATE CASCADE;
