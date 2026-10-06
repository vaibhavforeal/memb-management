-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_businessId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "businessId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
