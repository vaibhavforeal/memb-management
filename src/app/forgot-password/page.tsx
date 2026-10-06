import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
import { PasswordForm } from "@/components/password-form";
export default function ForgotPasswordPage() {
  return (
    <div className="auth-backdrop flex min-h-screen items-start justify-center px-4 pt-24">
      <main className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <Wordmark />
      <h1 className="text-2xl font-semibold">Forgot your password?</h1>
      <p className="text-sm text-muted-foreground">
        We’ll email a link to help you get back into your workspace.
      </p>
      <PasswordForm />
      <Link href="/login" className="block text-xs text-primary">
        Back to sign in
      </Link>
    </main>
    </div>
  );
}
