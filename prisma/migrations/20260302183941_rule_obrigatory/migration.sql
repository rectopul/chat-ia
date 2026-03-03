/*
  Warnings:

  - Made the column `ruleId` on table `ScheduledMessageJob` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ScheduledMessageJob" DROP CONSTRAINT "ScheduledMessageJob_ruleId_fkey";

-- AlterTable
ALTER TABLE "ScheduledMessageJob" ALTER COLUMN "ruleId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TimedMessageRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
