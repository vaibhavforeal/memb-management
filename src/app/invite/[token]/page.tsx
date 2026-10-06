import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/security";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const i = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { business: true },
  });
  return (
    <div className="auth-backdrop flex min-h-screen items-start justify-center px-4 pt-24">
      <main className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <Wordmark />
      <h1 className="text-2xl font-semibold">Welcome to membrr</h1>
      {i && !i.acceptedAt && i.expiresAt > new Date() ? (
        <>
          <p className="text-sm text-muted-foreground">
            Join {i.business.name} as {i.role.toLowerCase()}, using {i.email}.
          </p>
          {i.role === "OWNER" &&
            i.business.trialRequired &&
            !i.business.trialEndsAt && (
              <p className="text-sm text-muted-foreground">
                Your three-day free trial starts when you create your account.
                After the trial, choose a paid plan to continue.
              </p>
            )}
          <ActionForm action="accept-invite" submit="Create account">
            <input type="hidden" name="token" value={token} />
            <label className="field">
              Choose a password
              <Input
                required
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
              />
              <span>At least 12 characters.</span>
            </label>
          </ActionForm>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          This invitation has expired or was already used. Ask your owner for a
          new invitation.
        </p>
      )}
      <Link href="/login" className="block text-xs text-primary">
        Back to sign in
      </Link>
    </main>
    </div>
  );
}
