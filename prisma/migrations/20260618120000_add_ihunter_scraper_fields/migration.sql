-- AlterTable: iHunter screenshot URLs + scrape timestamp on Parcel
ALTER TABLE "Parcel"
  ADD COLUMN "ihunterCloseupUrl" TEXT,
  ADD COLUMN "ihunterOverlayUrl" TEXT,
  ADD COLUMN "ihunterScrapedAt" TIMESTAMP(3);

-- CreateTable: per-county iHunter scraper run tracking
CREATE TABLE "IHunterMapRun" (
    "id" SERIAL NOT NULL,
    "county" TEXT NOT NULL,
    "province" TEXT NOT NULL DEFAULT 'AB',
    "status" TEXT NOT NULL DEFAULT 'registered',
    "timesRun" INTEGER NOT NULL DEFAULT 0,
    "towersTotal" INTEGER NOT NULL DEFAULT 0,
    "towersProcessed" INTEGER NOT NULL DEFAULT 0,
    "towersMatched" INTEGER NOT NULL DEFAULT 0,
    "towersMissed" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IHunterMapRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IHunterMapRun_county_province_key" ON "IHunterMapRun"("county", "province");
CREATE INDEX "IHunterMapRun_status_idx" ON "IHunterMapRun"("status");
