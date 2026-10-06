import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireConsoleAdmin } from "@/lib/console/guard";
import {
  platformOverview,
  STATE_LABELS,
  WORKSPACE_STATES,
} from "@/lib/console/queries";
import { dateLabel, money } from "@/lib/domain";
import { razorpayAvailable } from "@/lib/razorpay";
import { manualWhatsApp } from "@/lib/whatsapp-mode";

export const dynamic = "force-dynamic";

export default async function ConsoleOverviewPage() {
  await requireConsoleAdmin();
  const data = await platformOverview();
  const manual = manualWhatsApp();
  const stats = [
    { title: "MRR", value: money(data.mrrPaise), sub: "Paid workspaces" },
    {
      title: "Collected this month",
      value: money(data.revenuePaise),
      sub: "Billing orders paid (IST month)",
    },
    {
      title: "New workspaces",
      value: `${data.last7} / ${data.last30}`,
      sub: "Last 7 / 30 days",
    },
    {
      title: "Total members",
      value: data.members.toLocaleString("en-IN"),
      sub: "Across all workspaces",
    },
  ];
  return (
    <>
      <PageHeading
        title="Overview"
        description={`${data.total} workspaces on the platform`}
      />
      {!razorpayAvailable() && (
        <p className="mb-4 rounded-lg border p-3 text-sm text-muted-foreground">
          Razorpay payments need RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and
          RAZORPAY_WEBHOOK_SECRET on the server. You can configure business fees
          now.
        </p>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.title} className="p-3">
            <p className="text-xs text-muted-foreground">{s.title}</p>
            <p className="stat-number mt-3">{s.value}</p>
            <p className="mt-2 text-[10px] text-muted-foreground">{s.sub}</p>
          </Card>
        ))}
      </div>
      <h2 className="mb-2 text-sm font-semibold">Workspaces by state</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {WORKSPACE_STATES.map((state) => (
          <Link key={state} href={`/workspaces?state=${state}`}>
            <Card className="p-3 hover:bg-muted/40">
              <p className="text-xs text-muted-foreground">
                {STATE_LABELS[state]}
              </p>
              <p className="stat-number mt-3">{data.byState[state]}</p>
            </Card>
          </Link>
        ))}
      </div>
      <h2 className="mb-2 text-sm font-semibold">Health</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">
            {manual ? "WhatsApp sending" : "Reminder worker"}
          </p>
          <div className="mt-3">
            <Badge>
              {manual ? "Manual" : data.workerUp ? "Active" : "Needs attention"}
            </Badge>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {manual
              ? "Messages are sent by each user in WhatsApp. No messaging worker is required."
              : (data.workerDetail ??
                "Start the worker process to schedule messages.")}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">
            Last successful backup
          </p>
          <p className="mt-3 text-sm">
            {data.backupAt ? dateLabel(data.backupAt) : "Not configured"}
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Configure encrypted off-site backups before launch.
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Razorpay</p>
          <div className="mt-3">
            <Badge>
              {razorpayAvailable() ? "Configured" : "Not configured"}
            </Badge>
          </div>
        </Card>
      </div>
    </>
  );
}
