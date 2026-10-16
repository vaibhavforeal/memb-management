import { connection } from "next/server";
import { Wordmark } from "@/components/wordmark";
import { LoginForm } from "@/components/login-form";
import { googleSignInEnabled, googleSignInError } from "@/lib/google-sign-in";

export default async function ConsoleLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; auth_error?: string }>;
}) {
  await connection();
  const query = await searchParams;
  // The console has no reset flow of its own; send admins to the main site's.
  const mainUrl = process.env.BETTER_AUTH_URL;
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <Wordmark />
          <span className="eyebrow rounded border px-2 py-0.5">Console</span>
        </div>
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Sign in</h1>
        <LoginForm
          googleEnabled={googleSignInEnabled()}
          demo={false}
          redirectTo="/"
          // Sign-in never creates Google accounts; should one arrive anyway (a
          // forged sign-up request), "/" runs the admin guard, which refuses it.
          newUserCallbackURL="/"
          forgotHref={mainUrl ? `${mainUrl}/forgot-password` : ""}
          initialError={
            // An unknown Google email has no account, so no console access either.
            query.error === "not_admin" || query.error === "signup_disabled"
              ? "This account doesn't have console access."
              : googleSignInError(query)
          }
        />
      </div>
    </main>
  );
}
