-- DropTable (adapter models no longer needed: credentials provider requires JWT strategy)
DROP TABLE "Account";
DROP TABLE "Session";
DROP TABLE "VerificationToken";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;