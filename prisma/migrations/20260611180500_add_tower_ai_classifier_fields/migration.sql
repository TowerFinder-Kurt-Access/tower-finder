-- AlterTable
ALTER TABLE "Tower" ADD COLUMN     "aiClassifiedAt" TIMESTAMP(3),
ADD COLUMN     "aiLabel" TEXT,
ADD COLUMN     "aiModelVersion" TEXT,
ADD COLUMN     "aiTowerScore" DOUBLE PRECISION,
ADD COLUMN     "humanLabel" TEXT,
ADD COLUMN     "labelSource" TEXT,
ADD COLUMN     "labeledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Tower_aiTowerScore_idx" ON "Tower"("aiTowerScore");

-- CreateIndex
CREATE INDEX "Tower_humanLabel_idx" ON "Tower"("humanLabel");

