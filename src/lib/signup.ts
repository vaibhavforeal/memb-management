import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { hashToken } from "./security";
import { trialEnd, SIGNUP_MONTHLY_FEE_PAISE } from "./workspace-access";

export const workspaceSignupSchema = z.object({
  businessName: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
});

export const signupSchema = workspaceSignupSchema.extend({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(12).max(128),
});

export class SignupError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function limitSignup(address: string) {
  const key = `public-signup:${hashToken(address)}`;
  const now = BigInt(Date.now());
  const allowed = await db.$transaction(async (tx) => {
    await tx.rateLimit.upsert({
      where: { key },
      create: { key, count: 0, lastRequest: now },
      update: {},
    });
    await tx.$queryRaw`SELECT id FROM "RateLimit" WHERE key = ${key} FOR UPDATE`;
    const prior = await tx.rateLimit.findUniqueOrThrow({ where: { key } });
    const count = now - prior.lastRequest >= 3_600_000n ? 0 : prior.count;
    if (count >= 5) return false;
    await tx.rateLimit.update({
      where: { key },
      data: { count: count + 1, lastRequest: now },
    });
    return true;
  });
  if (!allowed)
    throw new SignupError(
      "Too many signup attempts. Try again in one hour.",
      429,
    );
}

export async function signupWorkspace(input: unknown) {
  const result = signupSchema.safeParse(input);
  if (!result.success)
    throw new SignupError(
      "Enter your name, a valid email, workspace name, city, and a password between 12 and 128 characters.",
    );
  const { name, email, password, businessName, city } = result.data;
  const passwordHash = await hashPassword(password);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { id: randomUUID(), name, email },
      });
      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: user.id,
          userId: user.id,
          providerId: "credential",
          password: passwordHash,
        },
      });
      const business = await tx.business.create({
        data: {
          name: businessName,
          city,
          slug: `${businessName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 40)}-${randomUUID()}`,
          trialRequired: true,
          trialEndsAt: trialEnd(user.createdAt),
          monthlyFeePaise: SIGNUP_MONTHLY_FEE_PAISE,
          branches: { create: { name: "Main branch" } },
          access: { create: { userId: user.id, role: "OWNER" } },
        },
      });
      await tx.auditLog.create({
        data: {
          businessId: business.id,
          actorId: user.id,
          action: "WORKSPACE_SIGNUP",
          detail: `Three-day trial ends ${business.trialEndsAt!.toISOString()}; monthly plan: ${SIGNUP_MONTHLY_FEE_PAISE} paise INR`,
        },
      });
      return { email: user.email };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new SignupError(
        "An account already exists with this email. Sign in or reset your password.",
        409,
      );
    throw error;
  }
}

export async function completeGoogleSignup(userId: string, input: unknown) {
  const parsed = workspaceSignupSchema.safeParse(input);
  if (!parsed.success)
    throw new SignupError(
      "Enter a workspace name and city between 2 and 100 characters.",
    );
  const { businessName, city } = parsed.data;
  return db.$transaction(async (tx) => {
    // Serialize setup attempts for this account so retries cannot create extra trials.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        accounts: { where: { providerId: "google" }, select: { id: true } },
      },
    });
    if (!user?.emailVerified || !user.accounts.length)
      throw new SignupError(
        "Sign in with a verified Google account to continue.",
        403,
      );
    if (user.platformAdmin)
      throw new SignupError("Create your workspace from Platform admin.", 403);
    const existing = await tx.staffAccess.findFirst({ where: { userId } });
    if (existing) return { businessId: existing.businessId };
    const business = await tx.business.create({
      data: {
        name: businessName,
        city,
        slug: `${businessName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 40)}-${randomUUID()}`,
        trialRequired: true,
        trialEndsAt: trialEnd(user.createdAt),
        monthlyFeePaise: SIGNUP_MONTHLY_FEE_PAISE,
        branches: { create: { name: "Main branch" } },
        access: { create: { userId, role: "OWNER" } },
        audit: {
          create: {
            actorId: userId,
            action: "WORKSPACE_SIGNUP",
            detail: `Google signup; three-day trial ends ${trialEnd(user.createdAt).toISOString()}; monthly plan: ${SIGNUP_MONTHLY_FEE_PAISE} paise INR`,
          },
        },
      },
    });
    return { businessId: business.id };
  });
}
