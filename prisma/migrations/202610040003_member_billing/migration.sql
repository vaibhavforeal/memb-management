-- Preserve all historical totals. A null base amount identifies a legacy charge.
ALTER TABLE "Plan"
  ADD COLUMN "admissionFeePaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxInclusive" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Charge"
  ADD COLUMN "baseAmountPaise" INTEGER,
  ADD COLUMN "admissionFeePaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountType" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "discountValue" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "taxPaise" INTEGER NOT NULL DEFAULT 0;
