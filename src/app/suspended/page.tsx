import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
export default function Page() {
  return (
    <div className="auth-backdrop flex min-h-screen items-start justify-center px-4 pt-24">
      <main className="w-full max-w-md space-y-5 rounded-xl border bg-card p-8 shadow-sm">
        <Wordmark />
      <h1 className="text-xl font-semibold">Workspace access is paused</h1>
      <p className="text-sm text-muted-foreground">
        Contact your platform administrator to reactivate this business. Its
        member records have been retained.
      </p>
      <Link href="/login" className="text-primary">
        Back to sign in
      </Link>
    </main>
    </div>
  );
}
