-- Preserve access for existing workspaces; new workspaces require a trial or payment.
ALTER TABLE "Business" ADD COLUMN "trialRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Business" ALTER COLUMN "trialRequired" SET DEFAULT true;
