-- CreateIndex
CREATE INDEX "Campaign_businessId_templateId_idx" ON "Campaign"("businessId", "templateId");

-- CreateIndex
CREATE INDEX "Charge_businessId_memberId_idx" ON "Charge"("businessId", "memberId");

-- CreateIndex
CREATE INDEX "Member_businessId_contactId_idx" ON "Member"("businessId", "contactId");

-- CreateIndex
CREATE INDEX "Membership_businessId_planId_idx" ON "Membership"("businessId", "planId");

-- CreateIndex
CREATE INDEX "Message_businessId_campaignId_idx" ON "Message"("businessId", "campaignId");

-- CreateIndex
CREATE INDEX "Message_businessId_templateId_idx" ON "Message"("businessId", "templateId");

-- CreateIndex
CREATE INDEX "Payment_businessId_chargeId_idx" ON "Payment"("businessId", "chargeId");
