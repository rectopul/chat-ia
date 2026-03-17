-- CreateTable
CREATE TABLE "MediaCache" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "telegramDocId" TEXT,
    "accessHash" TEXT,
    "fileReference" BYTEA,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaCache_url_key" ON "MediaCache"("url");
