import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { hasWorkspaceAccess, workspaceAccess } from "@/lib/workspace-access";
import { buttonVariants } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";

export default async function UpgradePage() {
  const ctx = await getContext({ allowExpired: true });
  const business = await db.business.findUniqueOrThrow({
    where: { id: ctx.businessId },
  });
  if (hasWorkspaceAccess(business)) redirect("/dashboard");
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center p-4">
      <section className="w-full max-w-lg space-y-5 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <LockKeyhole className="text-primary" size={32} aria-hidden />
        <p className="eyebrow">{business.name}</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {workspaceAccess(business) === "PAYMENT_DUE"
            ? "Renew your paid plan"
            : "Your three-day trial has ended"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Upgrade to restore access. Your data is saved.
        </p>
        {ctx.role === "OWNER" ? (
          <Link href="/billing" className={buttonVariants()}>
            Go to paid plan →
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            Contact your workspace owner to renew the plan.
          </p>
        )}
        <div>
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
