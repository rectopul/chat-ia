-- CreateEnum
CREATE TYPE "ScrapingJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'TRANSFERRED', 'FAILED', 'FLOOD_WAIT', 'USER_PRIVACY', 'NOT_MUTUAL', 'ALREADY_PARTICIPANT');

-- CreateTable
CREATE TABLE "GroupScrapingJob" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "sourceGroupId" TEXT NOT NULL,
    "sourceGroupTitle" TEXT,
    "targetGroupId" TEXT NOT NULL,
    "targetGroupTitle" TEXT,
    "status" "ScrapingJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "scrapedUsers" INTEGER NOT NULL DEFAULT 0,
    "transferredUsers" INTEGER NOT NULL DEFAULT 0,
    "failedUsers" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupScrapingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapedUser" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapedUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTransfer" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "scrapedUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "transferredAt" TIMESTAMP(3),
    "error" TEXT,
    "floodWaitUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupScrapingJob_botId_idx" ON "GroupScrapingJob"("botId");

-- CreateIndex
CREATE INDEX "GroupScrapingJob_status_idx" ON "GroupScrapingJob"("status");

-- CreateIndex
CREATE INDEX "ScrapedUser_jobId_idx" ON "ScrapedUser"("jobId");

-- CreateIndex
CREATE INDEX "ScrapedUser_userId_idx" ON "ScrapedUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapedUser_jobId_userId_key" ON "ScrapedUser"("jobId", "userId");

-- CreateIndex
CREATE INDEX "UserTransfer_jobId_idx" ON "UserTransfer"("jobId");

-- CreateIndex
CREATE INDEX "UserTransfer_status_idx" ON "UserTransfer"("status");

-- CreateIndex
CREATE INDEX "UserTransfer_floodWaitUntil_idx" ON "UserTransfer"("floodWaitUntil");

-- AddForeignKey
ALTER TABLE "ScrapedUser" ADD CONSTRAINT "ScrapedUser_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GroupScrapingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTransfer" ADD CONSTRAINT "UserTransfer_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GroupScrapingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTransfer" ADD CONSTRAINT "UserTransfer_scrapedUserId_fkey" FOREIGN KEY ("scrapedUserId") REFERENCES "ScrapedUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
