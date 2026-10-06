import { db } from "../db";
import { hashToken, secretToken } from "../security";
import { sendEmail } from "../mail";
import { dayString, todayIST } from "../domain";
import { trialDateLabel } from "../workspace-access";

const DAY_MS = 86400000;

/** New trial end: max(now, current) + days. Days must be an integer 1–90. */
export function extendTrialEnd(
  current: Date | null,
  days: number,
  now: Date,
): Date {
  if (!Number.isInteger(days) || days < 1 || days > 90)
    throw new Error("Extend the trial by 1–90 days.");
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * DAY_MS);
}

/** Returns the reason a revocation is not allowed, or null when it is. */
export function canRevokeAdmin(
  actorId: string,
  targetId: string,
  adminCount: number,
): string | null {
  if (actorId === targetId)
    return "You cannot revoke your own platform admin access.";
  if (adminCount <= 1) return "At least one platform admin must remain.";
  return null;
}

/** Latest allowed "paid through" date: two years after today (IST). */
export const MARK_PAID_MAX_YEARS = 2;

/**
 * Validates the "mark paid through" form: a YYYY-MM-DD date from today (IST)
 * up to two years ahead, and a 10–500 char note.
 */
export function parseMarkPaid(
  date: string,
  note: string,
  now = new Date(),
): { paidThrough: Date; note: string } {
  const trimmed = note.trim();
  if (trimmed.length < 10 || trimmed.length > 500)
    throw new Error("Record a note for this payment (10–500 characters).");
  const value = date.trim();
  const paidThrough = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(paidThrough.getTime()) ||
    paidThrough.toISOString().slice(0, 10) !== value
  )
    throw new Error("Enter a valid date for paid through.");
  const today = todayIST(now);
  const latest = new Date(today);
  latest.setUTCFullYear(latest.getUTCFullYear() + MARK_PAID_MAX_YEARS);
  if (paidThrough < today)
    throw new Error("Paid through cannot be in the past.");
  if (paidThrough > latest)
    throw new Error(
      `Paid through can be at most ${MARK_PAID_MAX_YEARS} years ahead (${dayString(latest)}).`,
    );
  return { paidThrough, note: trimmed };
}

/** Throws a clear not-found error when the workspace does not exist. */
export async function requireBusiness(businessId: string) {
  const business = businessId
    ? await db.business.findUnique({ where: { id: businessId } })
    : null;
  if (!business) throw new Error("Workspace not found.");
  return business;
}

async function requireUser(userId: string) {
  const user = userId
    ? await db.user.findUnique({ where: { id: userId } })
    : null;
  if (!user) throw new Error("User not found.");
  return user;
}

export async function extendTrial(
  actorId: string,
  businessId: string,
  days: number,
) {
  await requireBusiness(businessId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
    const business = await tx.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const trialEndsAt = extendTrialEnd(business.trialEndsAt, days, new Date());
    await tx.business.update({
      where: { id: businessId },
      data: { trialEndsAt },
    });
    await tx.auditLog.create({
      data: {
        businessId,
        actorId,
        action: "CONSOLE_TRIAL_EXTENDED",
        detail: `Trial extended by ${days} days to ${trialDateLabel(trialEndsAt)}`,
      },
    });
    return trialEndsAt;
  });
}

export async function markPaidThrough(
  actorId: string,
  businessId: string,
  date: string,
  note: string,
) {
  const input = parseMarkPaid(date, note);
  await requireBusiness(businessId);
  await db.$transaction([
    db.business.update({
      where: { id: businessId },
      data: { billingPaidThrough: input.paidThrough },
    }),
    db.auditLog.create({
      data: {
        businessId,
        actorId,
        action: "CONSOLE_MARKED_PAID",
        detail: `Paid through ${date.trim()}: ${input.note}`,
      },
    }),
  ]);
}

/** Toggles ACTIVE / SUSPENDED and returns the new status. */
export async function toggleBusinessStatus(
  actorId: string,
  businessId: string,
) {
  await requireBusiness(businessId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
    const business = await tx.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const status = business.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    await tx.business.update({ where: { id: businessId }, data: { status } });
    await tx.auditLog.create({
      data: {
        businessId,
        actorId,
        action: "CONSOLE_STATUS_CHANGED",
        detail: status === "SUSPENDED" ? "Suspended" : "Activated",
      },
    });
    return status;
  });
}

/**
 * Re-issues the latest pending invitation for a workspace and emails it.
 * The token rotation and its audit row commit together before the email is
 * sent, so a mail failure never leaves an unaudited rotation behind.
 */
export async function resendInvitation(actorId: string, businessId: string) {
  await requireBusiness(businessId);
  const invitation = await db.invitation.findFirst({
    where: { businessId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!invitation) throw new Error("No pending invitation found.");
  const token = secretToken();
  await db.$transaction([
    db.invitation.update({
      where: { id: invitation.id },
      data: {
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * DAY_MS),
      },
    }),
    db.auditLog.create({
      data: {
        businessId,
        actorId,
        action: "CONSOLE_INVITE_RESENT",
        entityId: invitation.id,
        detail: `Invitation resent to ${invitation.email}`,
      },
    }),
  ]);
  await sendEmail(
    invitation.email,
    "Your membrr invitation",
    `${process.env.BETTER_AUTH_URL}/invite/${token}`,
  );
}

/** Creates a 30-minute support grant plus its audit entry. Sets no cookies. */
export async function grantSupportAccess(
  actorId: string,
  businessId: string,
  reason: string,
) {
  const trimmed = reason.trim();
  if (trimmed.length < 10 || trimmed.length > 500)
    throw new Error(
      "Record the reason for support access (10–500 characters).",
    );
  await requireBusiness(businessId);
  const expiresAt = new Date(Date.now() + 30 * 60000);
  return db.$transaction(async (tx) => {
    const grant = await tx.supportGrant.create({
      data: { actorId, businessId, reason: trimmed, expiresAt },
    });
    await tx.auditLog.create({
      data: {
        businessId,
        actorId,
        action: "SUPPORT_ACCESS_GRANTED",
        entityId: grant.id,
        detail: trimmed,
      },
    });
    return grant;
  });
}

/**
 * Grants or revokes platform admin. Revocations lock every admin row and use
 * that fresh count, so two concurrent revocations cannot remove the last admin.
 * Returns false when the user already had the requested state (no change, no audit).
 */
export async function setPlatformAdmin(
  actorId: string,
  targetId: string,
  grant: boolean,
) {
  await requireUser(targetId);
  return db.$transaction(async (tx) => {
    const admins = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "User" WHERE "platformAdmin" = true FOR UPDATE`;
    if (!admins.some((a) => a.id === actorId))
      throw new Error("Platform administrator access required.");
    const isAdmin = admins.some((a) => a.id === targetId);
    if (isAdmin === grant) return false;
    if (!grant) {
      const refusal = canRevokeAdmin(actorId, targetId, admins.length);
      if (refusal) throw new Error(refusal);
    }
    await tx.user.update({
      where: { id: targetId },
      data: { platformAdmin: grant },
    });
    await tx.auditLog.create({
      data: {
        businessId: null,
        actorId,
        action: grant ? "CONSOLE_ADMIN_GRANTED" : "CONSOLE_ADMIN_REVOKED",
        entityId: targetId,
        detail: grant ? "Platform admin granted" : "Platform admin revoked",
      },
    });
    return true;
  });
}

/** Deletes every session of the user (force sign-out). Returns the count removed. */
export async function revokeUserSessions(actorId: string, targetId: string) {
  await requireUser(targetId);
  return db.$transaction(async (tx) => {
    const { count } = await tx.session.deleteMany({
      where: { userId: targetId },
    });
    await tx.auditLog.create({
      data: {
        businessId: null,
        actorId,
        action: "CONSOLE_SESSIONS_REVOKED",
        entityId: targetId,
        detail: `${count} session${count === 1 ? "" : "s"} revoked`,
      },
    });
    return count;
  });
}
