import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { SignupForm } from "@/components/signup-form";
import { money } from "@/lib/domain";
import { SIGNUP_MONTHLY_FEE_PAISE } from "@/lib/workspace-access";
import { connection } from "next/server";
import { googleSignInEnabled } from "@/lib/google-sign-in";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; auth_error?: string }>;
}) {
  await connection();
  const query = await searchParams;
  const error =
    query.error === "account_not_linked"
      ? "An account already uses this email. Sign in with your password."
      : query.error || query.auth_error
        ? "Google signup was not completed. Try again or use email."
        : "";
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <Link href="/login" className="mb-6 inline-flex">
          <Wordmark />
        </Link>

        <h1 className="text-3xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mb-5 mt-3 text-sm text-muted-foreground">
          Three days free, then {money(SIGNUP_MONTHLY_FEE_PAISE)} per month. No
          card required.
        </p>
        <SignupForm
          googleEnabled={googleSignInEnabled()}
          initialError={error}
        />
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
