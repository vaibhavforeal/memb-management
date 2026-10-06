import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  calculateMembershipBill,
  parseDiscount,
  percentageBps,
} from "./membership-billing";
import { db } from "./db";
import { assertActive, ownerOnly, type TenantContext } from "./context";
import {
  addDays,
  balance,
  memberInput,
  parseDay,
  termEnd,
  todayIST,
  toPaise,
  type MemberInput,
} from "./domain";

export async function audit(
  ctx: TenantContext,
  action: string,
  entityId: string,
  detail: string,
) {
  await db.auditLog.create({
    data: {
      businessId: ctx.businessId,
      actorId: ctx.userId,
      action: ctx.support ? `SUPPORT:${action}` : action,
      entityId,
      detail,
    },
  });
}
export async function memberFor(ctx: TenantContext, id: string) {
  await assertActive(ctx);
  const m = await db.member.findFirst({
    where: { id, businessId: ctx.businessId },
    include: {
      contact: true,
      photo: { select: { version: true } },
      memberships: {
        orderBy: { endDate: "desc" },
        include: { charge: { include: { payments: true } } },
      },
      checkins: { take: 30, orderBy: { createdAt: "desc" } },
    },
  });
  if (!m) throw new Error("Member not found.");
  return m;
}
export async function saveMember(
  ctx: TenantContext,
  raw: MemberInput,
  id?: string,
) {
  await assertActive(ctx);
  const data = memberInput.parse(raw);
  if (id) await memberFor(ctx, id);
  const result = await db.$transaction(async (tx) => {
    // New contacts can receive messages. Edits preserve shared-number opt-outs.
    const contact = await tx.contact.upsert({
      where: {
        businessId_phone: { businessId: ctx.businessId, phone: data.phone },
      },
      create: { businessId: ctx.businessId, phone: data.phone },
      update: {},
    });
    const fields = {
      name: data.name,
      email: data.email || null,
      notes: data.notes,
      contactId: contact.id,
    };
    const m = id
      ? await tx.member.update({
          where: { businessId_id: { businessId: ctx.businessId, id } },
          data: fields,
        })
      : await tx.member.create({
          data: {
            ...fields,
            businessId: ctx.businessId,
            branchId: ctx.branchId,
            code: "CH-" + randomUUID().slice(0, 8).toUpperCase(),
          },
        });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: id ? "MEMBER_UPDATED" : "MEMBER_CREATED",
        entityId: m.id,
        detail: ctx.support ? "Support access" : "Staff dashboard",
      },
    });
    return m;
  });
  return result;
}
export async function importMembers(ctx: TenantContext, rows: MemberInput[]) {
  ownerOnly(ctx);
  await assertActive(ctx);
  if (!rows.length || rows.length > 2000)
    throw new Error("Import between 1 and 2,000 members at a time.");
  const parsed = rows.map((row) => memberInput.parse(row));
  const seen = new Set<string>();
  for (const row of parsed) {
    const key = `${row.name.toLowerCase()}|${row.phone}`;
    if (seen.has(key))
      throw new Error(
        `Duplicate CSV row: ${row.name}. Remove duplicate rows first.`,
      );
    seen.add(key);
  }
  return db.$transaction(
    async (tx) => {
      let created = 0,
        skipped = 0;
      for (const row of parsed) {
        const contact = await tx.contact.upsert({
          where: {
            businessId_phone: { businessId: ctx.businessId, phone: row.phone },
          },
          update: {},
          create: { businessId: ctx.businessId, phone: row.phone },
        });
        const duplicate = await tx.member.findFirst({
          where: {
            businessId: ctx.businessId,
            contactId: contact.id,
            name: { equals: row.name, mode: "insensitive" },
          },
        });
        if (duplicate) {
          skipped++;
          continue;
        }
        await tx.member.create({
          data: {
            businessId: ctx.businessId,
            branchId: ctx.branchId,
            contactId: contact.id,
            code: "CH-" + randomUUID().slice(0, 8).toUpperCase(),
            name: row.name,
            email: row.email || null,
            notes: row.notes,
          },
        });
        created++;
      }
      await tx.auditLog.create({
        data: {
          businessId: ctx.businessId,
          actorId: ctx.userId,
          action: "MEMBER_IMPORT",
          detail: `${created} created; ${skipped} existing rows skipped. Opt-outs preserved.`,
        },
      });
      return { created, skipped };
    },
    { timeout: 60000 },
  );
}
export async function savePlan(
  ctx: TenantContext,
  input: {
    id?: string;
    name: string;
    months: string;
    amount: string;
    admissionFee: string;
    taxRate: string;
    taxMode: string;
  },
) {
  ownerOnly(ctx);
  await assertActive(ctx);
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      months: z.coerce.number().int().min(1).max(36),
      taxMode: z.enum(["EXCLUSIVE", "INCLUSIVE"]),
    })
    .parse(input);
  const amountPaise = toPaise(input.amount);
  if (amountPaise <= 0) throw new Error("Plan fees must be positive.");
  const admissionFeePaise = toPaise(input.admissionFee || "0");
  const taxRateBps = percentageBps(input.taxRate || "0");
  const taxInclusive = parsed.taxMode === "INCLUSIVE";
  calculateMembershipBill({
    baseAmountPaise: amountPaise,
    admissionFeePaise,
    taxRateBps,
    taxInclusive,
  });
  const data = {
    name: parsed.name,
    months: parsed.months,
    amountPaise,
    admissionFeePaise,
    taxRateBps,
    taxInclusive,
  };
  return db.$transaction(async (tx) => {
    const plan = input.id
      ? await tx.plan.update({
          where: {
            businessId_id: { businessId: ctx.businessId, id: input.id },
          },
          data,
        })
      : await tx.plan.create({ data: { businessId: ctx.businessId, ...data } });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "PLAN_SAVED",
        entityId: plan.id,
        detail: JSON.stringify(data),
      },
    });
    return plan;
  });
}

export async function createMembership(
  ctx: TenantContext,
  input: {
    memberId: string;
    planId: string;
    startDate: string;
    endDate?: string;
    dueDate: string;
    includeAdmissionFee?: boolean;
    discountType?: string;
    discountValue?: string;
    discountReason?: string;
    expectedAmountPaise?: number;
  },
) {
  const member = await memberFor(ctx, input.memberId);
  if (member.archived)
    throw new Error("Restore this member before assigning a membership.");
  const discount = parseDiscount(input.discountType, input.discountValue);
  const discountReason = input.discountReason?.trim() ?? "";
  if (
    discountReason.length > 200 ||
    (discount.discountValue > 0 && discountReason.length < 3)
  )
    throw new Error("Give a discount reason (3–200 characters).");
  if (
    input.includeAdmissionFee !== undefined &&
    typeof input.includeAdmissionFee !== "boolean"
  )
    throw new Error("Choose whether to include the admission fee.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${input.memberId} AND "businessId" = ${ctx.businessId} FOR UPDATE`;
    const currentMember = await tx.member.findFirst({
      where: {
        id: input.memberId,
        businessId: ctx.businessId,
        archived: false,
      },
    });
    if (!currentMember)
      throw new Error("Restore this member before assigning a membership.");
    const plan = await tx.plan.findFirst({
      where: { id: input.planId, businessId: ctx.businessId, active: true },
    });
    if (!plan) throw new Error("Choose an active plan.");
    const startDate = parseDay(input.startDate),
      endDate = input.endDate
        ? parseDay(input.endDate)
        : termEnd(startDate, plan.months),
      dueDate = parseDay(input.dueDate);
    if (endDate < startDate || endDate > addDays(startDate, 3660))
      throw new Error(
        "The end date must be after the start date and within 10 years.",
      );
    const previousTerm = await tx.membership.findFirst({
      where: { businessId: ctx.businessId, memberId: input.memberId },
      select: { id: true },
    });
    if (previousTerm && input.includeAdmissionFee && plan.admissionFeePaise > 0)
      throw new Error(
        "Admission fees apply only to the first membership. Reload to review this renewal.",
      );
    const bill = calculateMembershipBill({
      baseAmountPaise: plan.amountPaise,
      admissionFeePaise:
        !previousTerm && input.includeAdmissionFee !== false
          ? plan.admissionFeePaise
          : 0,
      taxRateBps: plan.taxRateBps,
      taxInclusive: plan.taxInclusive,
      ...discount,
    });
    if (
      input.expectedAmountPaise !== undefined &&
      input.expectedAmountPaise !== bill.amountPaise
    )
      throw new Error(
        "The fee has changed. Reload and review the charge before activating.",
      );
    const conflict = await tx.membership.findFirst({
      where: {
        businessId: ctx.businessId,
        memberId: input.memberId,
        cancelledAt: null,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (conflict)
      throw new Error(
        "These dates overlap an existing membership. Review the start date.",
      );
    const term = await tx.membership.create({
      data: {
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        memberId: input.memberId,
        planId: plan.id,
        planName: plan.name,
        startDate,
        endDate,
      },
    });
    await tx.charge.create({
      data: {
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        memberId: input.memberId,
        membershipId: term.id,
        description: plan.name,
        ...bill,
        discountReason: discount.discountValue > 0 ? discountReason : "",
        dueDate,
      },
    });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "MEMBERSHIP_CREATED",
        entityId: term.id,
        detail: JSON.stringify({
          startDate: input.startDate,
          endDate: endDate.toISOString().slice(0, 10),
          ...bill,
          discountReason,
        }),
      },
    });
    return term;
  });
}
export async function cancelMembership(
  ctx: TenantContext,
  membershipId: string,
) {
  await assertActive(ctx);
  return db.$transaction(async (tx) => {
    const term = await tx.membership.findFirst({
      where: {
        id: membershipId,
        businessId: ctx.businessId,
        cancelledAt: null,
      },
    });
    if (!term) throw new Error("Active membership not found.");
    await tx.membership.update({
      where: { id: term.id },
      data: { cancelledAt: new Date() },
    });
    await tx.message.updateMany({
      where: {
        businessId: ctx.businessId,
        membershipId,
        status: "QUEUED",
        kind: "RENEWAL",
      },
      data: { status: "SUPPRESSED", lastError: "Membership cancelled" },
    });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "MEMBERSHIP_CANCELLED",
        entityId: term.id,
        detail:
          "Membership cancelled. Existing charges retained; use an owner charge waiver to remove unpaid fees.",
      },
    });
  });
}
export async function recordPayment(
  ctx: TenantContext,
  input: {
    chargeId: string;
    amountPaise: number;
    method: string;
    reference: string;
    idempotencyKey: string;
  },
) {
  await assertActive(ctx);
  if (
    !Number.isSafeInteger(input.amountPaise) ||
    input.amountPaise <= 0 ||
    input.amountPaise > 999999999
  )
    throw new Error("Enter a positive payment amount.");
  if (!["UPI", "CASH", "BANK"].includes(input.method))
    throw new Error("Choose cash, UPI, or bank transfer.");
  if (
    input.reference.length > 200 ||
    !/^[a-zA-Z0-9-]{12,100}$/.test(input.idempotencyKey)
  )
    throw new Error("Invalid payment reference.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Charge" WHERE id = ${input.chargeId} AND "businessId" = ${ctx.businessId} FOR UPDATE`;
    const charge = await tx.charge.findFirst({
      where: { id: input.chargeId, businessId: ctx.businessId },
      include: { payments: true },
    });
    if (!charge || charge.voidedAt)
      throw new Error("Charge not found or waived.");
    const key = `${ctx.businessId}:${input.idempotencyKey}`;
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      if (
        existing.chargeId !== charge.id ||
        existing.amountPaise !== input.amountPaise
      )
        throw new Error("Payment request has changed. Reload and try again.");
      return existing;
    }
    if (input.amountPaise > balance(charge))
      throw new Error("The payment exceeds the outstanding balance.");
    const payment = await tx.payment.create({
      data: {
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        chargeId: charge.id,
        amountPaise: input.amountPaise,
        method: input.method,
        reference: input.reference,
        recordedBy: ctx.userId,
        idempotencyKey: key,
      },
    });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "PAYMENT_RECORDED",
        entityId: payment.id,
        detail: `${input.amountPaise} paise via ${input.method}`,
      },
    });
    return payment;
  });
}
export async function reversePayment(
  ctx: TenantContext,
  paymentId: string,
  reason: string,
) {
  ownerOnly(ctx);
  await assertActive(ctx);
  if (reason.trim().length < 5 || reason.length > 500)
    throw new Error("Give a reason for the correction (5–500 characters).");
  return db.$transaction(async (tx) => {
    const p = await tx.payment.findFirst({
      where: {
        id: paymentId,
        businessId: ctx.businessId,
        amountPaise: { gt: 0 },
        reversalOfId: null,
      },
    });
    if (!p) throw new Error("Payment not found.");
    await tx.$queryRaw`SELECT id FROM "Charge" WHERE id = ${p.chargeId} AND "businessId" = ${ctx.businessId} FOR UPDATE`;
    if (await tx.payment.findUnique({ where: { reversalOfId: p.id } }))
      throw new Error("This payment has already been reversed.");
    const reversal = await tx.payment.create({
      data: {
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        chargeId: p.chargeId,
        amountPaise: -p.amountPaise,
        method: p.method,
        reference: p.reference,
        recordedBy: ctx.userId,
        reversalOfId: p.id,
        reversalReason: reason,
        idempotencyKey: `reversal:${p.id}`,
      },
    });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "PAYMENT_REVERSED",
        entityId: p.id,
        detail: reason,
      },
    });
    return reversal;
  });
}
export async function waiveCharge(
  ctx: TenantContext,
  chargeId: string,
  reason: string,
) {
  ownerOnly(ctx);
  await assertActive(ctx);
  if (reason.trim().length < 5)
    throw new Error("Give a reason for waiving the charge.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Charge" WHERE id = ${chargeId} AND "businessId" = ${ctx.businessId} FOR UPDATE`;
    const c = await tx.charge.findFirst({
      where: { id: chargeId, businessId: ctx.businessId },
      include: { payments: true },
    });
    if (!c || c.voidedAt) throw new Error("Charge not found.");
    if (c.payments.reduce((a, p) => a + p.amountPaise, 0) !== 0)
      throw new Error("Reverse recorded payments before waiving the charge.");
    await tx.charge.update({
      where: { id: chargeId },
      data: { voidedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "CHARGE_WAIVED",
        entityId: chargeId,
        detail: reason,
      },
    });
  });
}
export async function checkIn(
  ctx: TenantContext,
  memberId: string,
  day = todayIST(),
) {
  const m = await memberFor(ctx, memberId);
  if (
    m.archived ||
    !m.memberships.some(
      (t) => !t.cancelledAt && t.startDate <= day && t.endDate >= day,
    )
  )
    throw new Error("An active membership is required to check in.");
  return db.checkin.upsert({
    where: {
      businessId_memberId_day: { businessId: ctx.businessId, memberId, day },
    },
    update: {},
    create: {
      businessId: ctx.businessId,
      branchId: ctx.branchId,
      memberId,
      day,
      recordedBy: ctx.userId,
    },
  });
}
export function memberFilter(
  businessId: string,
  search = "",
  status = "all",
): Prisma.MemberWhereInput {
  const today = todayIST();
  const active = {
    cancelledAt: null,
    startDate: { lte: today },
    endDate: { gte: today },
  };
  return {
    businessId,
    archived: false,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
            { contact: { phone: { contains: search } } },
          ],
        }
      : {}),
    ...(status === "active"
      ? { memberships: { some: active } }
      : status === "expiring"
        ? {
            memberships: {
              some: {
                ...active,
                endDate: { gte: today, lte: addDays(today, 7) },
              },
            },
          }
        : status === "expired"
          ? {
              memberships: {
                some: {},
                none: { cancelledAt: null, endDate: { gte: today } },
              },
            }
          : {}),
  };
}
