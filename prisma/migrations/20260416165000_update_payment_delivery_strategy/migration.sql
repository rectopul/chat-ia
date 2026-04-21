-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('DELIVERY', 'PICKUP');

-- AlterTable
ALTER TABLE "BotAccount"
RENAME COLUMN "acceptedMethods" TO "acceptedPaymentMethods";

-- AlterTable
ALTER TABLE "BotAccount"
ADD COLUMN "availableDeliveryTypes" "DeliveryType"[] NOT NULL DEFAULT ARRAY['DELIVERY']::"DeliveryType"[];

-- Backfill
UPDATE "BotAccount"
SET "availableDeliveryTypes" = CASE
    WHEN "allowsPickup" = true
        THEN ARRAY['DELIVERY', 'PICKUP']::"DeliveryType"[]
    ELSE ARRAY['DELIVERY']::"DeliveryType"[]
END;

-- AlterTable
ALTER TABLE "BotAccount"
DROP COLUMN "allowsPickup";

-- AlterTable
ALTER TABLE "Order"
RENAME COLUMN "deliveryOption" TO "deliveryType";

-- AlterTable
ALTER TABLE "Order"
ALTER COLUMN "deliveryType" DROP DEFAULT,
ALTER COLUMN "deliveryType" DROP NOT NULL,
ALTER COLUMN "deliveryType" TYPE "DeliveryType" USING ("deliveryType"::"DeliveryType");
