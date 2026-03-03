-- AlterTable
ALTER TABLE "ScheduledMessageJob" ADD COLUMN     "ruleId" TEXT;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TimedMessageRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
