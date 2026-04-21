-- CreateEnum
CREATE TYPE "BusinessProfile" AS ENUM ('GROCERY', 'RESTAURANT', 'SNACK_BAR', 'EVENT');

-- AlterTable
ALTER TABLE "BotAccount"
ADD COLUMN "businessProfile" "BusinessProfile" NOT NULL DEFAULT 'GROCERY';
