-- Move the lease expiry from the owner to the parcel: the lease is per tower
-- site, and a parcel is one-to-one with its tower. Supersedes the owner-level
-- column added by 20261105090000_owner_lease_expiry.

-- AlterTable
ALTER TABLE "Parcel" ADD COLUMN     "leaseExpiry" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Owner" DROP COLUMN "leaseExpiry";

-- CreateTable
CREATE TABLE "LeaseExpiryHistory" (
    "id" SERIAL NOT NULL,
    "parcelId" INTEGER NOT NULL,
    "oldValue" TIMESTAMP(3),
    "newValue" TIMESTAMP(3),
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaseExpiryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaseExpiryHistory_parcelId_createdAt_idx" ON "LeaseExpiryHistory"("parcelId", "createdAt" DESC);
