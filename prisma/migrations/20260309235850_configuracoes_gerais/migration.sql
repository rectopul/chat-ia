-- CreateEnum
CREATE TYPE "MessageTemplateKey" AS ENUM ('WELCOME', 'DONT_SELL', 'SUBSCRIBER_CONTENT', 'TIMED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'COMBO');

-- CreateEnum
CREATE TYPE "UserSegment" AS ENUM ('NEW_USERS', 'ALL', 'BUYERS', 'NON_BUYERS');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT,
    "webhookSecret" TEXT,
    "apiId" INTEGER,
    "apiHash" TEXT,
    "businessBotToken" TEXT,
    "phoneNumber" TEXT,
    "session" TEXT,
    "isUserAccount" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotAccount_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "TelegramUser" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "isSubscriber" BOOLEAN NOT NULL DEFAULT false,
    "subscriberUntil" TIMESTAMP(3),
    "telegramUserId" TEXT NOT NULL,

    CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "key" "MessageTemplateKey" NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "text" TEXT,
    "mediaUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplateMedia" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MessageTemplateMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimedMessageRule" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "delaySeconds" INTEGER NOT NULL,
    "repeatIntervalSeconds" INTEGER,
    "segment" "UserSegment" NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimedMessageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledMessageJob" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledMessageJob_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "productType" "ProductType" NOT NULL DEFAULT 'ONE_TIME',
    "subscriberDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'PENDING',
    "referenceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SYNCPAY',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "rawPayload" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "referenceId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "MediaType" NOT NULL,
    "text" TEXT,
    "mediaUrl" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PixAudioConfig" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "durationSec" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PixAudioConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountConfig" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BotAccount_token_key" ON "BotAccount"("token");

-- CreateIndex
CREATE UNIQUE INDEX "BotAccount_phoneNumber_key" ON "BotAccount"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_chatId_key" ON "TelegramUser"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_telegramUserId_key" ON "TelegramUser"("telegramUserId");

-- CreateIndex
CREATE INDEX "TelegramUser_lastSeenAt_idx" ON "TelegramUser"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_telegramUserId_botId_key" ON "TelegramUser"("telegramUserId", "botId");

-- CreateIndex
CREATE INDEX "ScheduledMessageJob_status_runAt_idx" ON "ScheduledMessageJob"("status", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessConnection_connectionId_key" ON "BusinessConnection"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_referenceId_key" ON "Sale"("referenceId");

-- CreateIndex
CREATE INDEX "Sale_telegramUserId_paidAt_idx" ON "Sale"("telegramUserId", "paidAt");

-- CreateIndex
CREATE INDEX "Sale_status_idx" ON "Sale"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PixAudioConfig_botId_key" ON "PixAudioConfig"("botId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountConfig_botId_key" ON "DiscountConfig"("botId");

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramUser" ADD CONSTRAINT "TelegramUser_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplateMedia" ADD CONSTRAINT "MessageTemplateMedia_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimedMessageRule" ADD CONSTRAINT "TimedMessageRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimedMessageRule" ADD CONSTRAINT "TimedMessageRule_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_telegramUserId_botId_fkey" FOREIGN KEY ("telegramUserId", "botId") REFERENCES "TelegramUser"("telegramUserId", "botId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TimedMessageRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_telegramUserId_botId_fkey" FOREIGN KEY ("telegramUserId", "botId") REFERENCES "TelegramUser"("telegramUserId", "botId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_telegramUserId_botId_fkey" FOREIGN KEY ("telegramUserId", "botId") REFERENCES "TelegramUser"("telegramUserId", "botId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PixAudioConfig" ADD CONSTRAINT "PixAudioConfig_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountConfig" ADD CONSTRAINT "DiscountConfig_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountConfig" ADD CONSTRAINT "DiscountConfig_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
