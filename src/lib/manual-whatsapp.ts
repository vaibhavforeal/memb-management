import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { assertActive, ownerOnly, type TenantContext } from "./context";
import { addDays, balance, dateLabel, money, todayIST } from "./domain";
import { memberFilter } from "./services";
import { hashToken } from "./security";
import { manualKinds } from "./manual-message-utils";
import { manualWhatsApp } from "./whatsapp-mode";

export function manualMessagingReason(contact: { optedOutAt: Date | null }) {
  if (contact.optedOutAt)
    return "This contact has opted out of WhatsApp messages.";
  return "";
}

export async function manualComposer(
  ctx: TenantContext,
  input: {
    memberId?: string;
    kind?: string;
    referenceId?: string;
    segment?: string;
    q?: string;
    page?: string;
  },
) {
  const business = await assertActive(ctx);
  const kind = z
    .enum(manualKinds)
    .parse(input.kind || (input.memberId ? "UPDATE" : "ANNOUNCEMENT"));
  if (kind === "ANNOUNCEMENT" || !input.memberId) ownerOnly(ctx);
  if (!input.memberId && kind !== "ANNOUNCEMENT")
    throw new Error("Choose a member for this reminder.");
  const segment = ["all", "active", "expired", "expiring"].includes(
    input.segment ?? "",
  )
    ? input.segment!
    : "active";
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(input.page) || 1)),
  );
  const where: Prisma.MemberWhereInput = input.memberId
    ? { businessId: ctx.businessId, id: input.memberId, archived: false }
    : memberFilter(ctx.businessId, (input.q ?? "").slice(0, 100), segment);
  const [members, total] = await Promise.all([
    db.member.findMany({
      where,
      include: {
        contact: true,
        memberships: { orderBy: { endDate: "desc" } },
        charges: { include: { payments: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 50,
      skip: input.memberId ? 0 : (page - 1) * 50,
    }),
    db.member.count({ where }),
  ]);
  if (input.memberId && !members.length) throw new Error("Member not found.");
  const recipients = members.map((m) => {
    let reason = manualMessagingReason(m.contact);
    let body = "Hi {name},\n\nAn update from {business}:\n\n";
    if (kind === "UPDATE") body = `Hi ${m.name},\n\nThis is ${business.name}. `;
    if (kind === "RENEWAL") {
      const term = m.memberships.find(
        (t) => t.id === input.referenceId && !t.cancelledAt,
      );
      if (
        !term ||
        m.memberships.some(
          (t) => !t.cancelledAt && term && t.endDate > term.endDate,
        )
      )
        reason =
          "This membership was cancelled or renewed. Review the current membership first.";
      if (term)
        body = `Hi ${m.name}, your ${term.planName} membership at ${business.name} ${term.endDate < todayIST() ? "expired" : "expires"} on ${dateLabel(term.endDate)}. Please get in touch if you would like to renew. Thank you!`;
    }
    if (kind === "DUES") {
      const charge = m.charges.find((c) => c.id === input.referenceId);
      if (!charge || charge.voidedAt || balance(charge) <= 0)
        reason =
          "This fee is already settled or waived. There is no reminder to send.";
      if (charge)
        body = `Hi ${m.name}, a reminder from ${business.name}: ${money(Math.max(0, balance(charge)))} is outstanding for ${charge.description}, due on ${dateLabel(charge.dueDate)}. Please contact us if you have already paid. Thank you!`;
    }
    return {
      id: m.id,
      name: m.name,
      code: m.code,
      phone: m.contact.phone,
      body,
      reason,
    };
  });
  return { business: business.name, kind, recipients, total, page, segment };
}

export async function manualFollowUps(ctx: TenantContext) {
  await assertActive(ctx);
  const today = todayIST();
  const [renewals, dues] = await Promise.all([
    db.$queryRaw<
      { id: string; memberId: string; name: string; endDate: Date }[]
    >(Prisma.sql`
      SELECT t.id, t."memberId", m.name, t."endDate" FROM "Membership" t
      JOIN "Member" m ON m.id=t."memberId" AND m."businessId"=t."businessId"
      WHERE t."businessId"=${ctx.businessId} AND NOT m.archived AND t."cancelledAt" IS NULL
        AND t."startDate"<=${today} AND t."endDate" BETWEEN ${addDays(today, -7)} AND ${addDays(today, 7)}
        AND NOT EXISTS (SELECT 1 FROM "Membership" newer WHERE newer."businessId"=t."businessId" AND newer."memberId"=t."memberId" AND newer."cancelledAt" IS NULL AND newer."endDate">t."endDate")
      ORDER BY t."endDate", t.id LIMIT 20`),
    db.$queryRaw<
      {
        id: string;
        memberId: string;
        name: string;
        dueDate: Date;
        outstanding: bigint;
      }[]
    >(Prisma.sql`
      SELECT c.id, c."memberId", m.name, c."dueDate", (c."amountPaise"-COALESCE(p.paid,0))::bigint outstanding
      FROM "Charge" c JOIN "Member" m ON m.id=c."memberId" AND m."businessId"=c."businessId"
      LEFT JOIN (SELECT "chargeId", SUM("amountPaise") paid FROM "Payment" WHERE "businessId"=${ctx.businessId} GROUP BY "chargeId") p ON p."chargeId"=c.id
      WHERE c."businessId"=${ctx.businessId} AND NOT m.archived AND c."voidedAt" IS NULL AND c."dueDate"<=${today} AND c."amountPaise">COALESCE(p.paid,0)
      ORDER BY c."dueDate", c.id LIMIT 20`),
  ]);
  return { renewals, dues };
}

export async function recordManualSend(ctx: TenantContext, input: unknown) {
  if (!manualWhatsApp()) throw new Error("Manual sending is not enabled.");
  await assertActive(ctx);
  const data = z
    .object({
      memberId: z.string().min(1),
      phone: z.string(),
      kind: z.enum(manualKinds),
      body: z.string().trim().min(2).max(2000),
      requestId: z.uuid(),
      confirmed: z.literal(true),
    })
    .parse(input);
  if (data.kind === "ANNOUNCEMENT") ownerOnly(ctx);
  const member = await db.member.findFirst({
    where: { businessId: ctx.businessId, id: data.memberId, archived: false },
    include: { contact: true },
  });
  if (!member) throw new Error("Member not found.");
  if (member.contact.phone !== data.phone)
    throw new Error(
      "The phone number changed. Reload the member before recording this message.",
    );
  const reason = manualMessagingReason(member.contact);
  if (reason) throw new Error(reason);
  const idempotencyKey = hashToken(`${ctx.businessId}:${data.requestId}`);
  return db.$transaction(async (tx) => {
    const inserted = await tx.manualSend.createMany({
      data: [
        {
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          memberId: member.id,
          phone: data.phone,
          body: data.body,
          kind: data.kind,
          recordedBy: ctx.userId,
          idempotencyKey,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count)
      await tx.auditLog.create({
        data: {
          businessId: ctx.businessId,
          actorId: ctx.userId,
          action: "WHATSAPP_SENT_MANUALLY",
          entityId: member.id,
          detail:
            "User confirmed sending in WhatsApp. Delivery is not verified.",
        },
      });
    const saved = await tx.manualSend.findUniqueOrThrow({
      where: { idempotencyKey },
    });
    if (
      saved.memberId !== data.memberId ||
      saved.body !== data.body ||
      saved.phone !== data.phone
    )
      throw new Error(
        "This confirmation was already used for a different message. Reload before recording another.",
      );
    return saved;
  });
}
