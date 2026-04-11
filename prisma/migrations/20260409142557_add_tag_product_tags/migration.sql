-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTags" (
    "productId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,

    CONSTRAINT "ProductTags_pkey" PRIMARY KEY ("productId","tagId")
);

-- CreateIndex
CREATE INDEX "Tag_subscriberId_idx" ON "Tag"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_subscriberId_name_key" ON "Tag"("subscriberId", "name");

-- CreateIndex
CREATE INDEX "ProductTags_subscriberId_productId_idx" ON "ProductTags"("subscriberId", "productId");

-- CreateIndex
CREATE INDEX "ProductTags_subscriberId_tagId_idx" ON "ProductTags"("subscriberId", "tagId");

-- CreateIndex
CREATE INDEX "ProductTags_tagId_idx" ON "ProductTags"("tagId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTags" ADD CONSTRAINT "ProductTags_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTags" ADD CONSTRAINT "ProductTags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTags" ADD CONSTRAINT "ProductTags_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

