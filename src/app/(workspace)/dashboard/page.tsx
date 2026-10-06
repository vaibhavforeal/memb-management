import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  Plus,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { getContext } from "@/lib/context";
import { dashboard } from "@/lib/reporting";
import { dateLabel, daysBetween, money, todayIST } from "@/lib/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/avatar";
import { PageHeading } from "@/components/page-heading";
import { CollectionsChart } from "@/components/collections-chart";
import { Empty } from "@/components/empty";
export default async function DashboardPage() {
  const ctx = await getContext();
  const data = await dashboard(ctx);
  const stats = [
    {
      title: "Active members",
      value: data.active.toLocaleString("en-IN"),
      sub: `${data.total} total members`,
      Icon: Users,
      href: "/members?status=active",
    },
    {
      title: "Collected this month",
      value: money(data.collections),
      sub: "Net collections",
      Icon: Wallet,
      href: "/payments",
    },
    {
      title: "Expiring this week",
      value: String(data.expiring).padStart(2, "0"),
      sub: "Next 7 days",
      Icon: CalendarClock,
      href: "/members?status=expiring",
    },
    {
      title: "Checked in today",
      value: String(data.checkins).padStart(2, "0"),
      sub: "",
      Icon: UserCheck,
      href: "/attendance",
    },
  ];
  return (
    <>
      <PageHeading
        title="Overview"

        action={
          <Button asChild>
            <Link href="/members/new">
              <Plus />
              Add member
            </Link>
          </Button>
        }
      />
      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.title}
            href={s.href}
            className="group rounded-xl border bg-card p-2.5 transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.title}</span>
              <s.Icon size={16} className="text-muted-foreground" />
            </div>
            <p className="stat-number mt-1.5">{s.value}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              {s.sub && (
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              )}
              <ArrowUpRight
                size={13}
                className="ml-auto shrink-0 text-muted-foreground group-hover:text-primary"
              />
            </div>
          </Link>
        ))}
      </div>
      <div className="mb-3 grid gap-2.5 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Collection overview</CardTitle>
            </div>
            <span className="rounded-md border bg-background/30 px-3 py-1.5 text-[10px] text-muted-foreground">
              Last 6 months
            </span>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-baseline gap-3">
              <span className="text-[26px] font-semibold tracking-tight">
                {money(data.chart.reduce((s, p) => s + p.total, 0) * 100)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                total collected
              </span>
            </div>
            <CollectionsChart data={data.chart} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Member status</CardTitle>
            <Users size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-2">
              <div
                className="relative grid size-[154px] place-items-center rounded-full"
                style={{
                  background: `conic-gradient(#1d4ed8 0 ${(data.active / Math.max(data.total, 1)) * 100}%, #dbe4f6 0 100%)`,
                }}
              >
                <div className="grid size-[130px] place-content-center rounded-full bg-card text-center">
                  <span className="text-[32px] font-semibold tracking-tight">
                    {data.total}
                  </span>
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    Total members
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 divide-x border-b pb-4 text-center">
              <div>
                <span className="mr-1.5 inline-block size-1.5 rounded-full bg-primary" />
                <span className="text-[11px] text-muted-foreground">
                  Active
                </span>
                <p className="mt-1 text-base font-semibold">{data.active}</p>
              </div>
              <div>
                <span className="mr-1.5 inline-block size-1.5 rounded-full bg-[#8aa0c8]" />
                <span className="text-[11px] text-muted-foreground">
                  Other members
                </span>
                <p className="mt-1 text-base font-semibold">
                  {data.total - data.active}
                </p>
              </div>
            </div>
            <Link
              href="/members"
              className="mt-3 flex items-center justify-center gap-2 text-[11px] text-primary"
            >
              View members
              <ArrowRight size={13} />
            </Link>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-2.5 xl:grid-cols-[1.15fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Upcoming renewals</CardTitle>
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                {data.expiring}
              </span>
            </div>
            <Link
              href="/members?status=expiring"
              className="text-[11px] text-muted-foreground hover:text-primary"
            >
              View all <span aria-hidden>↗</span>
            </Link>
          </CardHeader>
          {data.renewals.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Expires</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.renewals.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link
                          href={`/members/${t.memberId}`}
                          className="flex items-center gap-2.5"
                        >
                          <Avatar name={t.member.name} small />
                          <span>
                            <span className="block text-xs font-medium">
                              {t.member.name}
                            </span>
                            <span className="mt-1 block text-[10px] text-muted-foreground">
                              {t.planName}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="text-xs text-amber-800">
                          {daysBetween(t.endDate, todayIST()) === 0
                            ? "Today"
                            : daysBetween(t.endDate, todayIST()) === 1
                              ? "Tomorrow"
                              : `In ${daysBetween(t.endDate, todayIST())} days`}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/members/${t.memberId}#renew`}
                          className="text-[11px] text-primary"
                        >
                          Renew <ArrowUpRight className="ml-1 inline size-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No upcoming renewals"
              description="No memberships expire in the next seven days."
            />
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Recent payments</CardTitle>
            <Link
              href="/payments"
              className="text-[11px] text-muted-foreground hover:text-primary"
            >
              View all ↗
            </Link>
          </CardHeader>
          {data.recentPayments.length ? (
            <div className="divide-y">
              {data.recentPayments.map((p) => (
                <Link
                  href={`/receipts/${p.id}`}
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-muted p-2 text-muted-foreground">
                      <CreditCard size={15} />
                    </span>
                    <span>
                      <span className="block text-xs font-medium">
                        {p.charge.member.name}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {p.method} · {dateLabel(p.createdAt)}
                      </span>
                    </span>
                  </div>
                  <span
                    className={`text-xs font-medium ${p.amountPaise < 0 ? "text-destructive" : "text-primary"}`}
                  >
                    {p.amountPaise >= 0 ? "+" : ""}
                    {money(p.amountPaise)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="No payments recorded" />
          )}
        </Card>
      </div>
      {data.outstanding > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-amber-50 p-2 text-amber-800">
              <Wallet size={18} />
            </span>
            <p className="text-xs">
              <strong className="font-medium">
                {money(data.outstanding)} in outstanding fees
              </strong>
            </p>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/payments">
              Review balances
              <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
