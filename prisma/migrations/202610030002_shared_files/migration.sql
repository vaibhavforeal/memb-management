CREATE TABLE "SharedFile" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA,
    "tokenHash" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "SharedFile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SharedFile_size_check" CHECK ("size" > 0 AND "size" <= 10485760)
);
CREATE UNIQUE INDEX "SharedFile_tokenHash_key" ON "SharedFile"("tokenHash");
CREATE INDEX "SharedFile_businessId_branchId_createdAt_idx" ON "SharedFile"("businessId", "branchId", "createdAt");
CREATE INDEX "SharedFile_businessId_uploadedBy_idx" ON "SharedFile"("businessId", "uploadedBy");
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SharedFile" ADD CONSTRAINT "SharedFile_businessId_branchId_fkey" FOREIGN KEY ("businessId", "branchId") REFERENCES "Branch"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
