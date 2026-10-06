import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
import { PasswordForm } from "@/components/password-form";
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="auth-backdrop flex min-h-screen items-start justify-center px-4 pt-24">
      <main className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <Wordmark />
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      {token ? (
        <PasswordForm token={token} />
      ) : (
        <p className="text-sm text-muted-foreground">
          This reset link is invalid. Request a new one.
        </p>
      )}
      <Link href="/login" className="block text-xs text-primary">
        Back to sign in
      </Link>
    </main>
    </div>
  );
}
