import { connection } from "next/server";
import { Wordmark } from "@/components/wordmark";
import { LoginForm } from "@/components/login-form";

export default async function ConsoleLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const query = await searchParams;
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <Wordmark />
          <span className="eyebrow rounded border px-2 py-0.5">Console</span>
        </div>
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Sign in</h1>
        <LoginForm
          googleEnabled={false}
          demo={false}
          redirectTo="/"
          initialError={
            query.error === "not_admin"
              ? "This account doesn't have console access."
              : ""
          }
        />
      </div>
    </main>
  );
}
