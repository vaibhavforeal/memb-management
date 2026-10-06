import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export function Footer({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6">
        <Wordmark />
        <nav
          aria-label="Account"
          className="flex gap-6 text-sm text-muted-foreground"
        >
          {signedIn ? (
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="hover:text-foreground">
                Sign in
              </Link>
              <Link href="/signup" className="hover:text-foreground">
                Sign up
              </Link>
            </>
          )}
        </nav>
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} membrr
        </p>
      </div>
    </footer>
  );
}
