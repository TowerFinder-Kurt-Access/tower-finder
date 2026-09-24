-- // remove_larry_signoff_fields
-- Removed columns no longer needed after dropping Brett/Larry sign-off workflow:
-- agreedItems, brettConfirmed, brettConfirmedAt, brettConfirmedBy,
-- larryCallNotes, larryComments, larryCalledAt,
-- adminSignName, adminSignAt, larrySignName, larrySignAt

ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "agreedItems";
ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "brettConfirmed";
ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "brettConfirmedAt";
ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "brettConfirmedBy";
ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "larryCallNotes";
ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "larryComments";
ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "larryCalledAt";
ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "adminSignName";
ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "adminSignAt";
ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "larrySignName";
ALTER TABLE "CustomerLeadForm" DROP COLUMN IF EXISTS "larrySignAt";
