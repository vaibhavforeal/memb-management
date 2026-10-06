import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import type { TenantContext } from "../src/lib/context";
export function ensureLocalTest() {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    process.env.NODE_ENV === "production"
  )
    throw new Error(
      "Tests that create fixtures require a local development database.",
    );
}
export async function fixture(prefix: string) {
  const run = randomUUID();
  const user = await db.user.create({
    data: {
      id: randomUUID(),
      name: "Test owner",
      email: `${prefix}-${run}@example.test`,
    },
  });
  const b = await db.business.create({
    data: {
      name: `${prefix} fixture`,
      slug: `${prefix}-${run}`,
      city: "Test",
      remindersEnabled: false,
      trialRequired: false,
      branches: { create: { name: "Main" } },
      access: { create: { userId: user.id, role: "OWNER" } },
    },
    include: { branches: true },
  });
  const ctx: TenantContext = {
    businessId: b.id,
    branchId: b.branches[0].id,
    userId: user.id,
    role: "OWNER",
    support: false,
  };
  return { ctx, b, user };
}
export async function cleanup(businessId: string) {
  // Only the explicitly created test workspace is removed. Never reset shared data.
  const b = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  if (!/^(itest|loadtest|backup-test)-/.test(b.slug))
    throw new Error("Refusing to clean a non-test workspace.");
  const access = await db.staffAccess.findMany({ where: { businessId } });
  await db.$transaction(
    async (tx) => {
      await tx.businessBillingOrder.deleteMany({ where: { businessId } });
      await tx.sharedFile.deleteMany({ where: { businessId } });
      await tx.manualSend.deleteMany({ where: { businessId } });
      await tx.message.deleteMany({ where: { businessId } });
      await tx.campaign.deleteMany({ where: { businessId } });
      await tx.messageTemplate.deleteMany({ where: { businessId } });
      await tx.whatsAppConnection.deleteMany({ where: { businessId } });
      await tx.checkin.deleteMany({ where: { businessId } });
      await tx.payment.deleteMany({ where: { businessId } });
      await tx.charge.deleteMany({ where: { businessId } });
      await tx.membership.deleteMany({ where: { businessId } });
      await tx.member.deleteMany({ where: { businessId } });
      await tx.contact.deleteMany({ where: { businessId } });
      await tx.plan.deleteMany({ where: { businessId } });
      await tx.auditLog.deleteMany({ where: { businessId } });
      await tx.invitation.deleteMany({ where: { businessId } });
      await tx.staffAccess.deleteMany({ where: { businessId } });
      await tx.supportGrant.deleteMany({ where: { businessId } });
      await tx.branch.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
    },
    { timeout: 120000 },
  );
  for (const a of access)
    if ((await db.staffAccess.count({ where: { userId: a.userId } })) === 0)
      await db.user.delete({ where: { id: a.userId } });
}
