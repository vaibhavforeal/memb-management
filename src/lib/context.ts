import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import { hasWorkspaceAccess, PlanRequiredError } from "./workspace-access";
export type TenantContext = {
  businessId: string;
  branchId: string;
  userId: string;
  role: "OWNER" | "STAFF";
  support: boolean;
};
export async function currentUser() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) redirect("/login");
  return s.user;
}
export async function requireAdmin() {
  const user = await currentUser();
  if (!user.platformAdmin)
    throw new Error("Platform administrator access is required.");
  return user;
}
export async function getContext(
  options: { allowExpired?: boolean; api?: boolean } = {},
): Promise<TenantContext> {
  const user = await currentUser();
  const jar = await cookies();
  const grantId = jar.get("membrr-support")?.value;
  if (user.platformAdmin && grantId) {
    const grant = await db.supportGrant.findFirst({
      where: { id: grantId, actorId: user.id, expiresAt: { gt: new Date() } },
    });
    if (grant) {
      const b = await db.business.findUniqueOrThrow({
        where: { id: grant.businessId },
        include: { branches: true },
      });
      if (b.status !== "ACTIVE") throw new Error("This business is suspended.");
      return {
        businessId: b.id,
        branchId: b.branches[0].id,
        userId: user.id,
        role: "OWNER",
        support: true,
      };
    }
  }
  const selectedBusiness = user.platformAdmin
    ? jar.get("membrr-business")?.value
    : undefined;
  const access = await db.staffAccess.findFirst({
    where: {
      userId: user.id,
      ...(selectedBusiness ? { businessId: selectedBusiness } : {}),
    },
    include: { business: { include: { branches: true } } },
  });
  if (!access) {
    // Admins without a workspace go to the console (or wait, if it is disabled).
    if (user.platformAdmin)
      redirect(process.env.CONSOLE_URL || "/access-pending");
    if (
      user.emailVerified &&
      (await db.account.findFirst({
        where: { userId: user.id, providerId: "google" },
        select: { id: true },
      }))
    )
      redirect("/onboarding");
    redirect("/access-pending");
  }
  if (access.business.status !== "ACTIVE") redirect("/suspended");
  if (!options.allowExpired && !hasWorkspaceAccess(access.business)) {
    if (options.api) throw new PlanRequiredError();
    redirect("/upgrade");
  }
  return {
    businessId: access.businessId,
    branchId: access.business.branches[0].id,
    userId: user.id,
    role: access.role as "OWNER" | "STAFF",
    support: false,
  };
}
export function ownerOnly(ctx: TenantContext) {
  if (ctx.role !== "OWNER")
    throw new Error("Only an owner can perform this action.");
}
export async function assertActive(
  ctx: TenantContext,
  options: { allowExpired?: boolean } = {},
) {
  const b = await db.business.findUnique({ where: { id: ctx.businessId } });
  if (!b || b.status !== "ACTIVE")
    throw new Error("This business is not active.");
  const branch = await db.branch.findFirst({
    where: { id: ctx.branchId, businessId: ctx.businessId },
  });
  if (!branch) throw new Error("Invalid branch access.");
  if (ctx.support) {
    const grant = await db.supportGrant.findFirst({
      where: {
        actorId: ctx.userId,
        businessId: ctx.businessId,
        expiresAt: { gt: new Date() },
      },
    });
    const user = await db.user.findUnique({ where: { id: ctx.userId } });
    if (!grant || !user?.platformAdmin)
      throw new Error("Support access has expired.");
  } else {
    const access = await db.staffAccess.findUnique({
      where: {
        businessId_userId: { businessId: ctx.businessId, userId: ctx.userId },
      },
    });
    if (!access || access.role !== ctx.role)
      throw new Error("Your access has changed. Please reload.");
  }
  if (!options.allowExpired && !hasWorkspaceAccess(b))
    throw new PlanRequiredError();
  return b;
}
