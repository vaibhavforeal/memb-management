"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  IndianRupee,
  LayoutGrid,
  LogOut,
  Menu,
  ScrollText,
  Users,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Avatar } from "../avatar";
import { Wordmark } from "../wordmark";

const nav = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/revenue", label: "Revenue", icon: IndianRupee },
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit", label: "Audit", icon: ScrollText },
];

/** usePathname() may report the rewritten `/console/...` path; normalise to the browser path. */
function visiblePath(pathname: string): string {
  if (pathname === "/console") return "/";
  return pathname.startsWith("/console/")
    ? pathname.slice("/console".length)
    : pathname;
}

export function ConsoleShell({
  admin,
  children,
}: {
  admin: { name: string; email: string };
  children: React.ReactNode;
}) {
  const path = visiblePath(usePathname());
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  const current = nav.find((n) => isActive(n.href))?.label ?? "Console";
  return (
    <div className="min-h-screen">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-[#0b1f4b]/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="console-navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col overflow-y-auto overscroll-contain border-r border-white/10 bg-sidebar-gradient px-3 text-white transition-transform lg:visible lg:translate-x-0 [&>*]:shrink-0",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-1 top-2 flex size-9 items-center justify-center rounded text-white/70 hover:bg-white/10 focus-visible:outline-white lg:hidden"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
        <Link
          href="/"
          className="flex h-12 items-center gap-2 px-2 focus-visible:outline-white"
        >
          <Wordmark tone="light" />
          <span className="eyebrow !text-white/50">Console</span>
        </Link>
        <nav className="mt-3 space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors focus-visible:outline-white",
                isActive(href)
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon size={17} />
              {label}
              {isActive(href) && (
                <span className="ml-auto size-1.5 rounded-full bg-sky-300" />
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-4">
          <div className="my-3 flex items-center gap-2.5 border-t border-white/10 pt-3">
            <Avatar name={admin.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{admin.name}</p>
              <p className="mt-1 truncate text-[10px] text-white/60">
                {admin.email}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await authClient.signOut();
                window.location.href = "/login";
              }}
              className="rounded p-2 text-white/70 hover:bg-white/10 focus-visible:outline-white"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="lg:ml-[220px]">
        <header className="flex h-12 items-center gap-3 border-b px-3 lg:px-5">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex size-9 items-center justify-center lg:hidden"
            aria-expanded={open}
            aria-controls="console-navigation"
            aria-label={open ? "Close navigation" : "Open navigation"}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="hidden text-xs text-muted-foreground sm:block">
            Console
          </span>
          <span className="hidden text-muted-foreground sm:block">/</span>
          <span className="text-xs font-medium">{current}</span>
        </header>
        <main className="mx-auto max-w-[1500px] p-2.5 lg:p-4">{children}</main>
      </div>
    </div>
  );
}
