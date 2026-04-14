-- AlterTable
ALTER TABLE "User"
ADD COLUMN "deliveryFeeCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "deliveryFeeCents" INTEGER NOT NULL DEFAULT 0;
