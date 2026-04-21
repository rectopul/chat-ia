ALTER TABLE "User"
ADD COLUMN "storeAddress" TEXT,
ADD COLUMN "acceptedPaymentMethods" "PaymentMethod"[] NOT NULL DEFAULT ARRAY[]::"PaymentMethod"[],
ADD COLUMN "availableDeliveryTypes" "DeliveryType"[] NOT NULL DEFAULT ARRAY['DELIVERY']::"DeliveryType"[];

UPDATE "User" AS "u"
SET
  "acceptedPaymentMethods" = COALESCE(
    (
      SELECT "b"."acceptedPaymentMethods"
      FROM "BotAccount" AS "b"
      WHERE
        "b"."ownerUserId" = "u"."id"
        AND cardinality("b"."acceptedPaymentMethods") > 0
      ORDER BY "b"."createdAt" ASC
      LIMIT 1
    ),
    ARRAY[]::"PaymentMethod"[]
  ),
  "availableDeliveryTypes" = COALESCE(
    (
      SELECT "b"."availableDeliveryTypes"
      FROM "BotAccount" AS "b"
      WHERE
        "b"."ownerUserId" = "u"."id"
        AND cardinality("b"."availableDeliveryTypes") > 0
      ORDER BY "b"."createdAt" ASC
      LIMIT 1
    ),
    ARRAY['DELIVERY']::"DeliveryType"[]
  );
