ALTER TABLE "Checkin" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'STAFF';

CREATE TABLE "MemberQr" (
    "memberId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberQr_pkey" PRIMARY KEY ("memberId")
);
CREATE UNIQUE INDEX "MemberQr_tokenHash_key" ON "MemberQr"("tokenHash");
CREATE INDEX "MemberQr_businessId_idx" ON "MemberQr"("businessId");
ALTER TABLE "MemberQr" ADD CONSTRAINT "MemberQr_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberQr" ADD CONSTRAINT "MemberQr_businessId_memberId_fkey" FOREIGN KEY ("businessId", "memberId") REFERENCES "Member"("businessId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
