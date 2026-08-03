-- DropIndex
DROP INDEX "Favorite_userId_idx";

-- DropIndex
DROP INDEX "Partner_slug_idx";

-- CreateIndex
CREATE INDEX "Application_erasedAt_createdAt_idx" ON "Application"("erasedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ContactRequest_companyId_createdAt_idx" ON "ContactRequest"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobApplication_userId_updatedAt_idx" ON "JobApplication"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "JobPosting_status_createdAt_idx" ON "JobPosting"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobPosting_companyId_status_createdAt_idx" ON "JobPosting"("companyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Referral_status_partnerId_idx" ON "Referral"("status", "partnerId");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");
