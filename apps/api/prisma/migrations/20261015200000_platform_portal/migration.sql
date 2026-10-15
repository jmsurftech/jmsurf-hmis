-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspendReason" TEXT;

-- CreateTable
CREATE TABLE "PortalOtp" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalOtp_identifier_createdAt_idx" ON "PortalOtp"("identifier", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_patientId_key" ON "PortalAccount"("patientId");
