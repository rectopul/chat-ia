-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "telegramFileId" TEXT;

-- AlterTable
ALTER TABLE "MessageTemplateMedia" ADD COLUMN     "telegramFileId" TEXT;
