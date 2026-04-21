-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX_ONLINE', 'PIX_DELIVERY', 'CARD_DELIVERY', 'CASH');

-- AlterTable
ALTER TABLE "BotAccount"
ADD COLUMN "acceptedMethods" "PaymentMethod"[] NOT NULL DEFAULT ARRAY[]::"PaymentMethod"[],
ADD COLUMN "allowsPickup" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "paymentMethod" "PaymentMethod",
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "deliveryOption" TEXT NOT NULL DEFAULT 'DELIVERY',
ADD COLUMN "changeAmount" DOUBLE PRECISION,
ADD COLUMN "pixPayload" TEXT;
