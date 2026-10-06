CREATE TABLE "BusinessLogo" (
    "businessId" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "version" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessLogo_pkey" PRIMARY KEY ("businessId")
);

ALTER TABLE "BusinessLogo" ADD CONSTRAINT "BusinessLogo_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
