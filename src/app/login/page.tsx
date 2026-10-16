import { Wordmark } from "@/components/wordmark";
import { LoginForm } from "@/components/login-form";
import { connection } from "next/server";
import Link from "next/link";
import { safeNext } from "@/lib/safe-next";
import { googleSignInEnabled, googleSignInError } from "@/lib/google-sign-in";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; auth_error?: string; next?: string }>;
}) {
  await connection();
  const query = await searchParams;
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
            googleEnabled={googleSignInEnabled()}
            initialError={googleSignInError(query)}
            redirectTo={safeNext(query.next)}
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
