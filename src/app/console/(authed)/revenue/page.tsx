import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { requireConsoleAdmin } from "@/lib/console/guard";
import {
  listOrders,
  monthlyRevenue,
  orderMonthField,
} from "@/lib/console/queries";
import { dateLabel, money } from "@/lib/domain";

export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireConsoleAdmin();
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? "";
  const status = first(sp.status) ?? "";
  const month = first(sp.month) ?? "";
  const [{ items, total, page, pages }, months] = await Promise.all([
    listOrders({ q, status, month, page: Number(first(sp.page)) || 1 }),
    monthlyRevenue(),
  ]);
  // The month filter uses the payment date for paid orders, otherwise the creation date.
  const monthLabel =
    orderMonthField(status) === "paidAt" ? "Paid in (IST)" : "Created in (IST)";
  const filterParams = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (month) params.set("month", month);
    return params;
  };
  const link = (p: number) => {
    const params = filterParams();
    params.set("page", String(p));
    return `/revenue?${params}`;
  };
  return (
    <>
      <PageHeading
        title="Revenue"
        description={`${total} orders matching`}
        action={
          <Button asChild variant="secondary">
            <a href={`/api/console/orders.csv?${filterParams()}`}>
              <Download />
              Export CSV
            </a>
          </Button>
        }
      />
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Last 12 months (paid, IST)</CardTitle>
        </CardHeader>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Paid amount</th>
                <th>Paid orders</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td>{money(m.paise)}</td>
                  <td>{m.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <form method="get" className="mb-3 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search workspace"
          className="max-w-xs"
        />
        <NativeSelect name="status" defaultValue={status} className="max-w-40">
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
        </NativeSelect>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {monthLabel}
          <Input
            name="month"
            type="month"
            defaultValue={month}
            className="max-w-44"
          />
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      <Card>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Workspace</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Period</th>
                <th>Razorpay order</th>
                <th>Razorpay payment</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td>{dateLabel(o.createdAt)}</td>
                  <td>
                    <Link
                      href={`/workspaces/${o.business.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {o.business.name}
                    </Link>
                  </td>
                  <td>{money(o.amountPaise)}</td>
                  <td>
                    <Badge>{o.paidAt ? "Paid" : "Pending"}</Badge>
                  </td>
                  <td>
                    {o.periodStart && o.periodEnd
                      ? `${dateLabel(o.periodStart)} – ${dateLabel(o.periodEnd)}`
                      : "—"}
                  </td>
                  <td className="font-mono text-xs">{o.razorpayOrderId}</td>
                  <td className="font-mono text-xs">
                    {o.razorpayPaymentId ?? "—"}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted-foreground">
                    No orders match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild variant="secondary">
                <Link href={link(page - 1)}>Previous</Link>
              </Button>
            )}
            {page < pages && (
              <Button asChild variant="secondary">
                <Link href={link(page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
