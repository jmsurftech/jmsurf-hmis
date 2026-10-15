-- CreateTable
CREATE TABLE "ModuleRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "facilityId" TEXT,
    "module" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "patientId" TEXT,
    "visitId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModuleRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModuleRecord_tenantId_number_key" ON "ModuleRecord"("tenantId", "number");
CREATE INDEX "ModuleRecord_tenantId_module_status_idx" ON "ModuleRecord"("tenantId", "module", "status");
CREATE INDEX "ModuleRecord_tenantId_module_createdAt_idx" ON "ModuleRecord"("tenantId", "module", "createdAt");
CREATE INDEX "ModuleRecord_tenantId_patientId_idx" ON "ModuleRecord"("tenantId", "patientId");
