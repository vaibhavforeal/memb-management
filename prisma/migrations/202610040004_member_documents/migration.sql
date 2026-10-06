ALTER TABLE "Business" ADD COLUMN "phone" TEXT NOT NULL DEFAULT '', ADD COLUMN "address" TEXT NOT NULL DEFAULT '';
CREATE TABLE "MemberPhoto" (
  "memberId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "version" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberPhoto_pkey" PRIMARY KEY ("memberId"),
  CONSTRAINT "MemberPhoto_businessId_memberId_fkey" FOREIGN KEY ("businessId", "memberId") REFERENCES "Member"("businessId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MemberPhoto_businessId_idx" ON "MemberPhoto"("businessId");
