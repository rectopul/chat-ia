-- AlterTable
ALTER TABLE "User"
ADD COLUMN "assistantName" TEXT,
ADD COLUMN "businessProfile" "BusinessProfile" NOT NULL DEFAULT 'GROCERY';
