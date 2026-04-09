-- CreateTable
CREATE TABLE "OperatingHour" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',

    CONSTRAINT "OperatingHour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatingHour_subscriberId_dayOfWeek_idx" ON "OperatingHour"("subscriberId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "OperatingHour" ADD CONSTRAINT "OperatingHour_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
