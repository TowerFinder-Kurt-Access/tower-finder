CREATE TABLE "TowerDocument" (
    "id" SERIAL NOT NULL,
    "towerId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOpenedAt" TIMESTAMP(3),
    "lastOpenedById" INTEGER,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TowerDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TowerDocument_towerId_idx" ON "TowerDocument"("towerId");
CREATE INDEX "TowerDocument_uploadedById_idx" ON "TowerDocument"("uploadedById");

ALTER TABLE "TowerDocument" ADD CONSTRAINT "TowerDocument_towerId_fkey"
    FOREIGN KEY ("towerId") REFERENCES "Tower"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TowerDocument" ADD CONSTRAINT "TowerDocument_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TowerDocument" ADD CONSTRAINT "TowerDocument_lastOpenedById_fkey"
    FOREIGN KEY ("lastOpenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
