import { cn } from "@/lib/utils";
const colors: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-800",
  ACTIVE: "bg-emerald-50 text-emerald-800",
  APPROVED: "bg-emerald-50 text-emerald-800",
  SENT: "bg-sky-50 text-sky-800",
  DELIVERED: "bg-emerald-50 text-emerald-800",
  READ: "bg-emerald-50 text-emerald-800",
  QUEUED: "bg-sky-50 text-sky-800",
  Expiring: "bg-amber-50 text-amber-800",
  Upcoming: "bg-sky-50 text-sky-800",
  Expired: "bg-destructive/10 text-destructive",
  FAILED: "bg-destructive/10 text-destructive",
  UNKNOWN: "bg-amber-50 text-amber-800",
  SUSPENDED: "bg-destructive/10 text-destructive",
  SIMULATED: "bg-sky-50 text-sky-800",
};
export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium tracking-wide",
        colors[String(children)] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      <span className="size-1 rounded-full bg-current" />
      {children}
    </span>
  );
}
