/*
  Warnings:

  - A unique constraint covering the columns `[phoneNumber]` on the table `BotAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "MediaType" ADD VALUE 'AUDIO';

-- DropForeignKey
ALTER TABLE "MessageTemplateMedia" DROP CONSTRAINT "MessageTemplateMedia_templateId_fkey";

-- AlterTable
ALTER TABLE "BotAccount" ADD COLUMN     "apiHash" TEXT,
ADD COLUMN     "apiId" INTEGER,
ADD COLUMN     "isUserAccount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "session" TEXT,
ALTER COLUMN "token" DROP NOT NULL,
ALTER COLUMN "webhookSecret" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RecurringSchedule" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "weekDays" INTEGER[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecurringSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotAccount_phoneNumber_key" ON "BotAccount"("phoneNumber");

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplateMedia" ADD CONSTRAINT "MessageTemplateMedia_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
