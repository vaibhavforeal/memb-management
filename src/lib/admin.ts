import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "./db";
import { hashToken, secretToken } from "./security";
import { sendEmail } from "./mail";
import { assertActive, ownerOnly, type TenantContext } from "./context";
import { trialEnd, SIGNUP_MONTHLY_FEE_PAISE } from "./workspace-access";

export async function inviteStaff(
  ctx: TenantContext,
  name: string,
  email: string,
  role = "STAFF",
) {
  ownerOnly(ctx);
  await assertActive(ctx);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !name.trim() ||
    !["OWNER", "STAFF"].includes(role)
  )
    throw new Error("Enter a valid staff name, email, and role.");
  const token = secretToken();
  const invite = await db.invitation.create({
    data: {
      businessId: ctx.businessId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  try {
    await sendEmail(
      invite.email,
      "Your membrr invitation",
      `${name}, you've been invited to membrr. Set up your account: ${process.env.BETTER_AUTH_URL}/invite/${token}\nThis link expires in 7 days.`,
    );
  } catch (e) {
    await db.invitation.delete({ where: { id: invite.id } });
    throw e;
  }
  return invite;
}
export async function acceptInvitation(token: string, password: string) {
  if (password.length < 12 || password.length > 128)
    throw new Error("Use a password between 12 and 128 characters.");
  const hashed = await hashPassword(password);
  return db.$transaction(async (tx) => {
    const invite = await tx.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { business: true },
    });
    if (
      !invite ||
      invite.acceptedAt ||
      invite.expiresAt < new Date() ||
      invite.business.status !== "ACTIVE"
    )
      throw new Error("This invitation is invalid or expired.");
    if (await tx.user.findUnique({ where: { email: invite.email } }))
      throw new Error(
        "An account already exists for this email. Sign in and ask the administrator to grant access.",
      );
    const claimed = await tx.invitation.updateMany({
      where: { id: invite.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (!claimed.count) throw new Error("Invitation already used.");
    const id = randomUUID();
    const user = await tx.user.create({
      data: { id, name: invite.name, email: invite.email, emailVerified: true },
    });
    await tx.account.create({
      data: {
        id: randomUUID(),
        accountId: id,
        userId: id,
        providerId: "credential",
        password: hashed,
      },
    });
    await tx.staffAccess.create({
      data: { businessId: invite.businessId, userId: id, role: invite.role },
    });
    if (invite.role === "OWNER") {
      // Start once when the first owner signs up; later invites cannot extend it.
      await tx.business.updateMany({
        where: {
          id: invite.businessId,
          trialRequired: true,
          trialEndsAt: null,
        },
        data: { trialEndsAt: trialEnd(user.createdAt) },
      });
    }
    await tx.auditLog.create({
      data: {
        businessId: invite.businessId,
        actorId: id,
        action: "INVITATION_ACCEPTED",
        detail: invite.role,
      },
    });
    return user;
  });
}
export async function createBusiness(
  actorId: string,
  name: string,
  city: string,
) {
  const user = await db.user.findUnique({ where: { id: actorId } });
  if (!user?.platformAdmin)
    throw new Error("Platform administrator access required.");
  if (
    name.trim().length < 2 ||
    name.trim().length > 100 ||
    city.trim().length < 2 ||
    city.trim().length > 100
  )
    throw new Error(
      "Enter a business name and city between 2 and 100 characters.",
    );
  const createdAt = new Date();
  return db.business.create({
    data: {
      name: name.trim(),
      city: city.trim(),
      createdAt,
      trialRequired: true,
      trialEndsAt: trialEnd(createdAt),
      monthlyFeePaise: SIGNUP_MONTHLY_FEE_PAISE,
      slug: `${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40)}-${randomUUID().slice(0, 6)}`,
      branches: { create: { name: "Main branch" } },
      access: { create: { userId: actorId, role: "OWNER" } },
      audit: {
        create: {
          actorId,
          action: "BUSINESS_CREATED",
          detail: "Created by platform administrator with owner access",
        },
      },
    },
  });
}
