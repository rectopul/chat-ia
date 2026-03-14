-- CreateTable
CREATE TABLE "DontSellInterval" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "delaySeconds" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DontSellInterval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DontSellInterval_botId_isActive_idx" ON "DontSellInterval"("botId", "isActive");

-- AddForeignKey
ALTER TABLE "DontSellInterval" ADD CONSTRAINT "DontSellInterval_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
