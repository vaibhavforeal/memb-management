import { Wordmark } from "@/components/wordmark";
import { LoginForm } from "@/components/login-form";
import { connection } from "next/server";
import Link from "next/link";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; auth_error?: string }>;
}) {
  await connection();
  const query = await searchParams;
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  const signInError =
    query.error === "account_not_linked"
      ? "Use your verified membrr email with Google, or sign in with your password."
      : query.error || query.auth_error
        ? "Google sign-in was not completed. Try again or use your password."
        : "";
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between bg-brand-gradient p-8 text-white lg:flex">
        <Wordmark tone="light" />
        <div className="max-w-md">
          <h1 className="text-5xl font-medium leading-[1.15] tracking-[-2px]">
            Club management,
            <br />
            <span className="text-sky-300">in one place.</span>
          </h1>
          <p className="mt-6 text-base text-white/75">
            Members, payments, and attendance.
          </p>
        </div>
        <div />
      </section>
      <section className="auth-backdrop flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <Wordmark className="mb-6 lg:hidden" />
          <h2 className="mb-6 text-3xl font-semibold tracking-tight">
            Sign in
          </h2>

          <LoginForm
            googleEnabled={googleEnabled}
            initialError={signInError}
            demo={
              process.env.NODE_ENV !== "production" &&
              process.env.SEED_DEMO === "true"
            }
          />
          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            New to membrr?{" "}
            <Link href="/signup" className="text-primary">
              Start a three-day free trial
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
