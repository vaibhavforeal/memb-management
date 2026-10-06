import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
export default function Page() {
  return (
    <div className="auth-backdrop flex min-h-screen items-start justify-center px-4 pt-24">
      <main className="w-full max-w-md space-y-5 rounded-xl border bg-card p-8 shadow-sm">
        <Wordmark />
      <h1 className="text-xl font-semibold">
        Your workspace access is pending
      </h1>
      <p className="text-sm text-muted-foreground">
        Ask your workspace owner or platform administrator to grant access.
      </p>
      <Link href="/login" className="text-primary">
        Back to sign in
      </Link>
    </main>
    </div>
  );
}
