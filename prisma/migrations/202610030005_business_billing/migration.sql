ALTER TABLE "Business" ADD COLUMN "monthlyFeePaise" INTEGER,
ADD COLUMN "billingPaidThrough" DATE,
ADD CONSTRAINT "Business_monthlyFeePaise_check" CHECK ("monthlyFeePaise" IS NULL OR "monthlyFeePaise" BETWEEN 100 AND 1000000000);

CREATE TABLE "BusinessBillingOrder" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "amountPaise" INTEGER NOT NULL CHECK ("amountPaise" BETWEEN 100 AND 1000000000),
  "currency" TEXT NOT NULL DEFAULT 'INR' CHECK ("currency" = 'INR'),
  "razorpayKeyId" TEXT NOT NULL,
  "razorpayOrderId" TEXT NOT NULL,
  "razorpayPaymentId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "periodStart" DATE,
  "periodEnd" DATE,
  CONSTRAINT "BusinessBillingOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessBillingOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BusinessBillingOrder_razorpayOrderId_key" ON "BusinessBillingOrder"("razorpayOrderId");
CREATE UNIQUE INDEX "BusinessBillingOrder_razorpayPaymentId_key" ON "BusinessBillingOrder"("razorpayPaymentId");
CREATE INDEX "BusinessBillingOrder_businessId_createdAt_idx" ON "BusinessBillingOrder"("businessId", "createdAt");
