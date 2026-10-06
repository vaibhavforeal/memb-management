"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  BarChart3,
  CalendarCheck,
  ChevronRight,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings2,
  ShieldCheck,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { Wordmark } from "./wordmark";
import { ActionForm } from "./action-form";
import { trialDateLabel } from "@/lib/workspace-access";
import { BusinessLogo } from "./business-logo";
const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/members", label: "Members", icon: Users },
  { href: "/plans", label: "Membership plans", icon: Ticket },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];
export function Shell({
  children,
  business,
  user,
  role,
  support,
  dryRun,
  manual,
  date,
  trialEndsAt,
}: {
  children: React.ReactNode;
  business: {
    name: string;
    city: string;
    connectionStatus: string;
    logoUrl: string | null;
  };
  user: { name: string; email: string; platformAdmin?: boolean };
  role: string;
  support: boolean;
  dryRun: boolean;
  manual: boolean;
  date: string;
  trialEndsAt?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!trialEndsAt) return;
    const timeout = setTimeout(
      () => window.location.reload(),
      Math.max(0, new Date(trialEndsAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [trialEndsAt]);
  const title =
    [
      ...nav,
      { href: "/whatsapp", label: "WhatsApp" },
      { href: "/settings", label: "Settings" },
      { href: "/billing", label: "Business billing" },
    ].find((n) => pathname.startsWith(n.href))?.label ?? "Workspace";
  const link = (href: string, label: string, Icon: typeof Users) => (
    <Link
      key={href}
      href={href}
      onClick={() => setOpen(false)}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors focus-visible:outline-white",
        pathname.startsWith(href)
          ? "bg-white/15 text-white"
          : "text-white/70 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon size={17} />
      {label}
      {pathname.startsWith(href) && (
        <span className="ml-auto size-1.5 rounded-full bg-sky-300" />
      )}
    </Link>
  );
  return (
    <div className="min-h-screen">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-[#0b1f4b]/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="workspace-navigation"
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
          href="/dashboard"
          className="flex h-12 items-center px-2 focus-visible:outline-white"
        >
          <Wordmark tone="light" />
        </Link>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 p-2.5">
          <BusinessLogo src={business.logoUrl} name={business.name} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{business.name}</p>
            <p className="mt-1 text-[10px] text-white/60">
              {business.city} · Main branch
            </p>
          </div>
        </div>
        <p className="eyebrow mb-2 px-2.5 !text-white/50">Workspace</p>
        <nav className="space-y-0.5">
          {nav.map((n) => link(n.href, n.label, n.icon))}
        </nav>
        <p className="eyebrow mb-2 mt-4 px-2.5 !text-white/50">Engagement</p>
        <nav className="space-y-0.5">
          {link("/whatsapp", "WhatsApp", MessageCircle)}
          {role === "OWNER" && link("/settings", "Settings", Settings2)}
          {role === "OWNER" && link("/billing", "Business billing", CreditCard)}
        </nav>
        <div className="mt-auto pt-4">
          {user.platformAdmin && link("/admin", "Platform admin", ShieldCheck)}
          <div className="my-3 flex items-center gap-2.5 border-t border-white/10 pt-3">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{user.name}</p>
              <p className="mt-1 text-[10px] capitalize text-white/60">
                {support ? "Support session" : role.toLowerCase()}
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
        <header className="flex h-12 items-center justify-between gap-3 border-b px-3 lg:px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="flex size-9 items-center justify-center lg:hidden"
              aria-expanded={open}
              aria-controls="workspace-navigation"
              aria-label={open ? "Close navigation" : "Open navigation"}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="hidden text-xs text-muted-foreground sm:block">
              Workspace
            </span>
            <ChevronRight
              size={13}
              className="hidden text-muted-foreground sm:block"
            />
            <span className="text-xs font-medium">{title}</span>
          </div>
          <div className="flex items-center gap-3">
            <form
              action="/members"
              className="hidden items-center gap-2 md:flex"
            >
              <Search size={15} className="text-muted-foreground" />
              <input
                name="q"
                aria-label="Search members"
                placeholder="Search members…"
                className="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
              />
            </form>
            <span className="hidden border-l pl-3 text-[11px] text-muted-foreground sm:block">
              {date}
            </span>
            <Link
              href={manual ? "/whatsapp" : "/whatsapp?status=FAILED"}
              title={manual ? "WhatsApp follow-ups" : "Message delivery issues"}
              aria-label={
                manual ? "WhatsApp follow-ups" : "Message delivery issues"
              }
              className="flex size-9 items-center justify-center text-muted-foreground"
            >
              <Bell size={17} />
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-2.5 lg:p-4">
          {trialEndsAt && (
            <div
              role="status"
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-3 text-xs"
            >
              <span>
                Three-day free trial · ends {trialDateLabel(trialEndsAt)}
              </span>
              {role === "OWNER" ? (
                <Link href="/billing" className="font-semibold text-primary">
                  Choose a paid plan →
                </Link>
              ) : (
                <span className="text-muted-foreground">
                  Ask your owner to choose a paid plan.
                </span>
              )}
            </div>
          )}
          {support && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              <span className="flex items-center gap-2">
                <ShieldCheck size={16} />
                Audited support session · expires after 30 minutes
              </span>
              <ActionForm
                action="end-support"
                submit="End support session"
                className=""
                variant="secondary"
              />
            </div>
          )}
          {dryRun && !manual && (
            <p className="mb-3 text-xs text-muted-foreground">
              WhatsApp test mode · Messages are simulated.
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
