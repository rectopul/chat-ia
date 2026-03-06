-- DropForeignKey
ALTER TABLE "RecurringSchedule" DROP CONSTRAINT "RecurringSchedule_botId_fkey";

-- DropForeignKey
ALTER TABLE "RecurringSchedule" DROP CONSTRAINT "RecurringSchedule_templateId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledMessageJob" DROP CONSTRAINT "ScheduledMessageJob_botId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledMessageJob" DROP CONSTRAINT "ScheduledMessageJob_ruleId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledMessageJob" DROP CONSTRAINT "ScheduledMessageJob_templateId_fkey";

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessageJob" ADD CONSTRAINT "ScheduledMessageJob_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TimedMessageRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
