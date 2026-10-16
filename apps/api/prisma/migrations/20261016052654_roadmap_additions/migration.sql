-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "patientId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "to" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCallLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "error" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyzerDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'ASTM',
    "model" TEXT,
    "apiKeyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "testMap" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyzerDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['receivables:read', 'financing:read']::TEXT[],
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "FinanceConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancingRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "partnerId" TEXT,
    "payerId" TEXT,
    "receivablesMinor" INTEGER NOT NULL,
    "requestedMinor" INTEGER NOT NULL,
    "offeredMinor" INTEGER,
    "feeMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "claimIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "partnerNote" TEXT,
    "requestedBy" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakGlassGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientId" TEXT,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakGlassGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_tenantId_code_lang_channel_key" ON "MessageTemplate"("tenantId", "code", "lang", "channel");

-- CreateIndex
CREATE INDEX "ReminderLog_tenantId_createdAt_idx" ON "ReminderLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_tenantId_kind_refId_key" ON "ReminderLog"("tenantId", "kind", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPreference_patientId_key" ON "PatientPreference"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_tenantId_key_key" ON "IdempotencyRecord"("tenantId", "key");

-- CreateIndex
CREATE INDEX "AiCallLog_tenantId_createdAt_idx" ON "AiCallLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyzerDevice_apiKeyHash_key" ON "AnalyzerDevice"("apiKeyHash");

-- CreateIndex
CREATE INDEX "AnalyzerDevice_tenantId_idx" ON "AnalyzerDevice"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePartner_apiKeyHash_key" ON "FinancePartner"("apiKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceConsent_tenantId_partnerId_key" ON "FinanceConsent"("tenantId", "partnerId");

-- CreateIndex
CREATE INDEX "FinancingRequest_tenantId_status_idx" ON "FinancingRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancingRequest_tenantId_requestNumber_key" ON "FinancingRequest"("tenantId", "requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "BreakGlassGrant_tenantId_userId_expiresAt_idx" ON "BreakGlassGrant"("tenantId", "userId", "expiresAt");

-- CreateIndex
CREATE INDEX "BreakGlassGrant_tenantId_reviewedAt_idx" ON "BreakGlassGrant"("tenantId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "FinanceConsent" ADD CONSTRAINT "FinanceConsent_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "FinancePartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
