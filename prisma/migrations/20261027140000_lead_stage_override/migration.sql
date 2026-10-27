CREATE TABLE "LeadStageOverride" (
    "key" TEXT NOT NULL,
    "label" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeadStageOverride_pkey" PRIMARY KEY ("key")
);
