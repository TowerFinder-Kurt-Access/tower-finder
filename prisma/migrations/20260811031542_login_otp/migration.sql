-- Extend the audit enum with OTP lifecycle events
ALTER TYPE "LoginEventType" ADD VALUE IF NOT EXISTS 'OTP_SENT';
ALTER TYPE "LoginEventType" ADD VALUE IF NOT EXISTS 'OTP_VERIFIED';
ALTER TYPE "LoginEventType" ADD VALUE IF NOT EXISTS 'OTP_FAILED';

-- CreateTable
CREATE TABLE "LoginOtp" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginOtp_email_key" ON "LoginOtp"("email");

-- CreateIndex
CREATE INDEX "LoginOtp_expiresAt_idx" ON "LoginOtp"("expiresAt");
