-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('PROSPECTIVE', 'LATER_OUTREACH', 'NOT_INTERESTED', 'LARRYS_CORNER');

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "towerId" INTEGER NOT NULL,
    "stage" "LeadStage" NOT NULL,
    "contactPerson" TEXT,
    "companyName" TEXT,
    "actions" TEXT,
    "remarks" TEXT,
    "brettStatus" TEXT,
    "emailFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_towerId_idx" ON "Lead"("towerId");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_towerId_fkey" FOREIGN KEY ("towerId") REFERENCES "Tower"("id") ON DELETE CASCADE ON UPDATE CASCADE;
