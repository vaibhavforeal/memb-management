CREATE TABLE "ManualSend" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "recordedBy" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualSend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ManualSend_idempotencyKey_key" ON "ManualSend"("idempotencyKey");
CREATE INDEX "ManualSend_businessId_createdAt_idx" ON "ManualSend"("businessId", "createdAt");
CREATE INDEX "ManualSend_businessId_memberId_idx" ON "ManualSend"("businessId", "memberId");
CREATE INDEX "ManualSend_businessId_branchId_idx" ON "ManualSend"("businessId", "branchId");
ALTER TABLE "ManualSend" ADD CONSTRAINT "ManualSend_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualSend" ADD CONSTRAINT "ManualSend_businessId_branchId_fkey" FOREIGN KEY ("businessId", "branchId") REFERENCES "Branch"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualSend" ADD CONSTRAINT "ManualSend_businessId_memberId_fkey" FOREIGN KEY ("businessId", "memberId") REFERENCES "Member"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
