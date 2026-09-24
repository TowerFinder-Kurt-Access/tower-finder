-- CreateTable
CREATE TABLE "CustomerLeadForm" (
    "id" SERIAL NOT NULL,
    "dealType" TEXT,
    "callDate" TIMESTAMP(3),
    "source" TEXT,
    "fileId" TEXT,
    "owner" TEXT,
    "phone" TEXT,
    "contact" TEXT,
    "email" TEXT,
    "mailingAddress" TEXT,
    "siteAddress" TEXT,
    "towerId" INTEGER,
    "payorOfRent" TEXT,
    "payorDetail" TEXT,
    "tenants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "siteType" TEXT,
    "siteTypeDetail" TEXT,
    "currentRent" DOUBLE PRECISION,
    "currentRentPeriod" TEXT,
    "rentIncreaseType" TEXT,
    "rentIncreaseAmount" TEXT,
    "leaseCommencement" TIMESTAMP(3),
    "leaseExpiration" TIMESTAMP(3),
    "rentEscalationDate" TIMESTAMP(3),
    "rofr" TEXT,
    "mortgage" TEXT,
    "mortgageInfo" TEXT,
    "feesPercent" BOOLEAN NOT NULL DEFAULT false,
    "feesPercentValue" DOUBLE PRECISION,
    "feesDollar" BOOLEAN NOT NULL DEFAULT false,
    "feesDollarValue" DOUBLE PRECISION,
    "notes" TEXT,
    "agreedItems" JSONB,
    "brettConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "brettConfirmedAt" TIMESTAMP(3),
    "brettConfirmedBy" TEXT,
    "larryCallNotes" TEXT,
    "larryComments" TEXT,
    "larryCalledAt" TIMESTAMP(3),
    "adminSignName" TEXT,
    "adminSignAt" TIMESTAMP(3),
    "larrySignName" TEXT,
    "larrySignAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerLeadForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLeadForm_towerId_idx" ON "CustomerLeadForm"("towerId");

-- CreateIndex
CREATE INDEX "CustomerLeadForm_status_idx" ON "CustomerLeadForm"("status");

-- CreateIndex
CREATE INDEX "CustomerLeadForm_fileId_idx" ON "CustomerLeadForm"("fileId");

-- AddForeignKey
ALTER TABLE "CustomerLeadForm" ADD CONSTRAINT "CustomerLeadForm_towerId_fkey" FOREIGN KEY ("towerId") REFERENCES "Tower"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLeadForm" ADD CONSTRAINT "CustomerLeadForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

