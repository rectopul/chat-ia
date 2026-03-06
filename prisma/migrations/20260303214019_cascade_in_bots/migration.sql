-- DropForeignKey
ALTER TABLE "TelegramUser" DROP CONSTRAINT "TelegramUser_botId_fkey";

-- AddForeignKey
ALTER TABLE "TelegramUser" ADD CONSTRAINT "TelegramUser_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
