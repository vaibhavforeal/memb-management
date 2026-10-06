import { redirect } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { currentUser } from "@/lib/context";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { SignoutButton } from "@/components/signout-button";
import { money } from "@/lib/domain";
import {
  SIGNUP_MONTHLY_FEE_PAISE,
  trialDateLabel,
  trialEnd,
} from "@/lib/workspace-access";

export default async function OnboardingPage() {
  const sessionUser = await currentUser();
  const user = await db.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
  });
  if (user.platformAdmin) redirect("/admin");
  if (
    await db.staffAccess.findFirst({
      where: { userId: user.id },
      select: { id: true },
    })
  )
    redirect("/dashboard");
  if (
    !user.emailVerified ||
    !(await db.account.findFirst({
      where: { userId: user.id, providerId: "google" },
      select: { id: true },
    }))
  )
    redirect("/access-pending");
  const endsAt = trialEnd(user.createdAt);
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <Wordmark className="mb-6" />
        <h1 className="text-3xl font-semibold tracking-tight">
          Create your workspace
        </h1>
        <p className="mb-5 mt-3 text-sm text-muted-foreground">
          {endsAt > new Date()
            ? `Free trial ends ${trialDateLabel(endsAt)}, then ${money(SIGNUP_MONTHLY_FEE_PAISE)} per month.`
            : `Your free trial has ended. Continue with a ${money(SIGNUP_MONTHLY_FEE_PAISE)} monthly plan.`}
        </p>
        <ActionForm action="complete-google-signup" submit="Create workspace">
          <label className="field">
            Workspace name
            <Input
              name="businessName"
              required
              minLength={2}
              maxLength={100}
              autoComplete="organization"
            />
          </label>
          <label className="field">
            City
            <Input
              name="city"
              required
              minLength={2}
              maxLength={100}
              autoComplete="address-level2"
            />
          </label>
        </ActionForm>
        <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
          <span className="truncate text-xs text-muted-foreground">
            {user.email}
          </span>
          <SignoutButton />
        </div>
      </section>
    </main>
  );
}
