-- AlterTable
ALTER TABLE "ScheduledMessageJob" ADD COLUMN     "businessBotToken" TEXT;

-- CreateTable
CREATE TABLE "BusinessConnection" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "userTelegramId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessConnection_connectionId_key" ON "BusinessConnection"("connectionId");
