import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

const links = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="membrr home">
          <Wordmark />
        </Link>
        <nav
          aria-label="Sections"
          className="hidden items-center gap-7 md:flex"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/dashboard" className={cn(buttonVariants(), "px-4")}>
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost" }), "px-3")}
              >
                Sign in
              </Link>
              <Link href="/signup" className={cn(buttonVariants(), "px-4")}>
                Start free trial
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
