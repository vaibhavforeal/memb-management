import Link from "next/link";
import { ArrowUpRight, Wallet, CreditCard, ReceiptText } from "lucide-react";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { dashboard } from "@/lib/reporting";
import { balance, dateLabel, money } from "@/lib/domain";
import { PageHeading } from "@/components/page-heading";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await getContext(),
    params = await searchParams,
    page = Math.max(1, Number(params.page) || 1);
  const [summary, payments, total, charges] = await Promise.all([
    dashboard(ctx),
    db.payment.findMany({
      where: { businessId: ctx.businessId },
      include: { charge: { include: { member: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: (page - 1) * 20,
    }),
    db.payment.count({ where: { businessId: ctx.businessId } }),
    db.charge.findMany({
      where: { businessId: ctx.businessId, voidedAt: null },
      include: { member: true, payments: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);
  const unpaid = charges.filter((c) => balance(c) > 0);
  return (
    <>
      <PageHeading title="Payments & balances" />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {[
          {
            label: "Collected this month",
            value: money(summary.collections),
            Icon: Wallet,
          },
          {
            label: "Outstanding fees",
            value: money(summary.outstanding),
            Icon: CreditCard,
          },
          {
            label: "Unpaid membership charges",
            value: String(unpaid.length),
            Icon: ReceiptText,
          },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              {s.label}
              <s.Icon size={16} />
            </div>
            <p className="stat-number mt-3">{s.value}</p>
          </Card>
        ))}
      </div>
      <Card className="mb-4 overflow-hidden">
        <CardHeader>
          <CardTitle>Outstanding balances</CardTitle>
          <span className="text-xs text-muted-foreground">
            Oldest due dates first · showing up to 20
          </span>
        </CardHeader>
        {unpaid.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Membership</th>
                  <th>Due date</th>
                  <th>Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {unpaid.slice(0, 20).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/members/${c.memberId}?tab=payments`}
                        className="flex items-center gap-3"
                      >
                        <Avatar name={c.member.name} small />
                        {c.member.name}
                      </Link>
                    </td>
                    <td className="text-muted-foreground">{c.description}</td>
                    <td className="text-muted-foreground">
                      {dateLabel(c.dueDate)}
                    </td>
                    <td className="text-amber-800">{money(balance(c))}</td>
                    <td>
                      <Link
                        href={`/members/${c.memberId}?tab=payments`}
                        className="text-xs text-primary"
                      >
                        Record payment ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="All settled"
            description="There are no outstanding membership fees."
          />
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Payment ledger</CardTitle>
          <span className="text-xs text-muted-foreground">
            Original entries and recorded corrections
          </span>
        </CardHeader>
        {payments.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.charge.member.name}</td>
                    <td className="text-muted-foreground">
                      {dateLabel(p.createdAt)}
                    </td>
                    <td>
                      <Badge>{p.amountPaise < 0 ? "Reversal" : p.method}</Badge>
                    </td>
                    <td className="max-w-36 truncate text-muted-foreground">
                      {p.reference || "—"}
                    </td>
                    <td
                      className={
                        p.amountPaise < 0 ? "text-destructive" : "text-primary"
                      }
                    >
                      {money(p.amountPaise)}
                    </td>
                    <td>
                      <Link
                        href={`/receipts/${p.id}`}
                        aria-label={`Receipt for ${p.charge.member.name}`}
                      >
                        <ArrowUpRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No payments yet"
            description="Record fees on a member’s page to see them here."
          />
        )}
        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <span>{total} ledger entries</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/payments?page=${page - 1}`}>Previous</Link>
              </Button>
            )}
            {page * 20 < total && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/payments?page=${page + 1}`}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
