ALTER TABLE "Lead" ADD COLUMN "customStageKey" TEXT;

CREATE TABLE "LeadCustomStage" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadCustomStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadCustomStage_key_key" ON "LeadCustomStage"("key");
CREATE INDEX "Lead_customStageKey_idx" ON "Lead"("customStageKey");
