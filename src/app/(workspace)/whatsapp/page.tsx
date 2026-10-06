import Link from "next/link";
import {
  MessageCircle,
  Plus,
  Send,
  CheckCheck,
  AlertCircle,
} from "lucide-react";
import { db } from "@/lib/db";
import { getContext } from "@/lib/context";
import { dateLabel } from "@/lib/domain";
import { PageHeading } from "@/components/page-heading";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { Empty } from "@/components/empty";
import { ActionForm } from "@/components/action-form";
import { manualWhatsApp } from "@/lib/whatsapp-mode";
import ManualWhatsAppHome from "@/components/manual-whatsapp-home";
export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  if (manualWhatsApp())
    return <ManualWhatsAppHome searchParams={searchParams} />;
  const ctx = await getContext(),
    params = await searchParams,
    status = params.status || "all",
    page = Math.max(1, Number(params.page) || 1);
  const where = {
    businessId: ctx.businessId,
    ...(status !== "all" ? { status } : {}),
  };
  const [counts, messages, total, campaigns, business] = await Promise.all([
    db.message.groupBy({
      by: ["status"],
      where: { businessId: ctx.businessId },
      _count: true,
    }),
    db.message.findMany({
      where,
      include: { member: true, template: true },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: (page - 1) * 20,
    }),
    db.message.count({ where }),
    db.campaign.findMany({
      where: { businessId: ctx.businessId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.business.findUniqueOrThrow({
      where: { id: ctx.businessId },
      include: { connection: true },
    }),
  ]);
  const count = (...statuses: string[]) =>
    counts
      .filter((c) => statuses.includes(c.status))
      .reduce((n, c) => n + c._count, 0);
  return (
    <>
      <PageHeading
        title="Keep your community close"

        action={
          ctx.role === "OWNER" && (
            <Button asChild>
              <Link href="/whatsapp/new">
                <Plus />
                New announcement
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            name: "Queued",
            value: count("QUEUED", "PROCESSING"),
            icon: MessageCircle,
          },
          {
            name: "Sent",
            value: count("SENT", "DELIVERED", "READ"),
            icon: Send,
          },
          {
            name: "Delivered",
            value: count("DELIVERED", "READ"),
            icon: CheckCheck,
          },
          {
            name: "Needs attention",
            value: count("FAILED", "UNKNOWN"),
            icon: AlertCircle,
          },
        ].map((s) => (
          <Card key={s.name} className="p-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              {s.name}
              <s.icon size={16} />
            </div>
            <p className="stat-number mt-3">{s.value}</p>
          </Card>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
        <div>
          <p className="text-sm font-medium">
            Membership reminders{" "}
            {business.remindersEnabled ? "enabled" : "paused"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Renewals: {business.renewalOffsets.join(", ")} days before expiry ·
            Dues: {business.duesOffsets.join(", ")} days after due date ·{" "}
            {business.reminderHour}:00 IST
          </p>
        </div>
        {ctx.role === "OWNER" && (
          <Button asChild variant="secondary" size="sm">
            <Link href="/settings">Manage automation</Link>
          </Button>
        )}
      </div>
      {campaigns.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Recent announcements</CardTitle>
          </CardHeader>
          <div className="divide-y">
            {campaigns.map((c) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                key={c.id}
              >
                <div>
                  <p className="text-xs font-medium">{c.name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {c.recipientCount} recipients · Scheduled{" "}
                    {dateLabel(c.scheduledAt)}
                  </p>
                </div>
                {c.cancelledAt ? (
                  <Badge>Cancelled</Badge>
                ) : (
                  ctx.role === "OWNER" && (
                    <ActionForm
                      action="cancel-campaign"
                      submit="Stop pending messages"
                      variant="secondary"
                      className=""
                    >
                      <input type="hidden" name="campaignId" value={c.id} />
                    </ActionForm>
                  )
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Message history</CardTitle>
          <form className="flex gap-2">
            <NativeSelect
              aria-label="Filter message status"
              name="status"
              defaultValue={status}
              className="h-8 w-auto text-xs sm:h-8"
            >
              {[
                "all",
                "QUEUED",
                "SENT",
                "DELIVERED",
                "READ",
                "FAILED",
                "UNKNOWN",
                "SUPPRESSED",
                "SIMULATED",
              ].map((s) => (
                <option key={s} value={s}>
                  {s === "all"
                    ? "All statuses"
                    : s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </NativeSelect>
            <Button variant="secondary" size="sm">
              Filter
            </Button>
          </form>
        </CardHeader>
        {messages.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Template</th>
                  <th>Scheduled</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/members/${m.memberId}`}>
                        {m.member.name}
                      </Link>
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {m.template.name}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {dateLabel(m.scheduledAt)}
                    </td>
                    <td>
                      <Badge>{m.status}</Badge>
                    </td>
                    <td className="max-w-xs whitespace-normal text-[11px] text-muted-foreground">
                      {m.lastError ||
                        (m.readAt
                          ? "Read receipt received"
                          : m.deliveredAt
                            ? "Delivered to recipient"
                            : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your next conversation starts here"
            description="Automated reminders and announcements appear here as they are queued."
          />
        )}
        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <span>
            {total} messages · {count("SIMULATED")} simulated, not sent
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/whatsapp?status=${encodeURIComponent(status)}&page=${page - 1}`}
              >
                Previous
              </Link>
            )}
            {page * 20 < total && (
              <Link
                href={`/whatsapp?status=${encodeURIComponent(status)}&page=${page + 1}`}
              >
                Next
              </Link>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
