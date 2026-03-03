/*
  Warnings:

  - A unique constraint covering the columns `[telegramUserId,botId]` on the table `TelegramUser` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `botId` to the `MessageLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `botId` to the `Sale` table without a default value. This is not possible if the table is not empty.
  - Added the required column `botId` to the `ScheduledMessageJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `botId` to the `TelegramUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `botId` to the `TimedMessageRule` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MessageLog" DROP CONSTRAINT "MessageLog_telegramUserId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_telegramUserId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledMessageJob" DROP CONSTRAINT "ScheduledMessageJob_telegramUserId_fkey";

-- AlterTable
ALTER TABLE "MessageLog" ADD COLUMN     "botId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "botId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ScheduledMessageJob" ADD COLUMN     "botId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TelegramUser" ADD COLUMN     "botId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TimedMessageRule" ADD COLUMN     "botId" TEXT NOT NULL,
ADD COLUMN     "repeatIntervalSeconds" INTEGER;

-- CreateTable
CREATE TABLE "BotAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotAccount_token_key" ON "BotAccount"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_telegramUserId_botId_key" ON "TelegramUser"("telegramUserId", "botId");

-- AddForeignKey
ALTER TABLE "TelegramUser" ADD CONSTRAINT "TelegramUser_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimedMessageRule" ADD CONSTRAINT "TimedMessageRule_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_telegramUserId_botId_fkey" FOREIGN KEY ("telegramUserId", "botId") REFERENCES "TelegramUser"("telegramUserId", "botId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_telegramUserId_botId_fkey" FOREIGN KEY ("telegramUserId", "botId") REFERENCES "TelegramUser"("telegramUserId", "botId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_telegramUserId_botId_fkey" FOREIGN KEY ("telegramUserId", "botId") REFERENCES "TelegramUser"("telegramUserId", "botId") ON DELETE RESTRICT ON UPDATE CASCADE;
