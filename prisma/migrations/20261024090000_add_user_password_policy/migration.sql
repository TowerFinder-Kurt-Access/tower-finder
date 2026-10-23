-- CreateTable
CREATE TABLE "UserPasswordPolicy" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPasswordPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPasswordPolicy_userId_key" ON "UserPasswordPolicy"("userId");

-- AddForeignKey
ALTER TABLE "UserPasswordPolicy" ADD CONSTRAINT "UserPasswordPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
