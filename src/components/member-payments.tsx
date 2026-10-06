import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { memberFor } from "@/lib/services";
import { balance, dateLabel, money } from "@/lib/domain";
import { ActionForm } from "./action-form";
import { ChargeBreakdown } from "./charge-breakdown";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input, NativeSelect } from "./ui/input";

export function MemberPayments({
  member,
  owner,
}: {
  member: Awaited<ReturnType<typeof memberFor>>;
  owner: boolean;
}) {
  const charges = member.memberships.flatMap((term) =>
    term.charge ? [term.charge] : [],
  );
  const payments = charges
    .flatMap((charge) =>
      charge.payments.map((payment) => ({
        ...payment,
        plan: charge.description,
      })),
    )
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Membership charges</CardTitle>
          <span className="text-[11px] text-muted-foreground">
            {charges.length} charges
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {!charges.length && (
            <p className="text-sm text-muted-foreground">
              Assign a membership to create the first charge.
            </p>
          )}
          {charges.map((charge) => (
            <div key={charge.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{charge.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fee: {money(charge.amountPaise)} · Due{" "}
                    {dateLabel(charge.dueDate)}
                  </p>
                </div>
                <span
                  className={`text-xs ${balance(charge) > 0 ? "text-amber-800" : "text-primary"}`}
                >
                  {charge.voidedAt
                    ? "Waived"
                    : balance(charge) > 0
                      ? `${money(balance(charge))} outstanding`
                      : charge.amountPaise === 0
                        ? "No payment required"
                        : "Paid in full"}
                </span>
              </div>
              <div className="mt-3 max-w-md">
                <ChargeBreakdown bill={charge} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/bills/${charge.id}`}>View bill</Link>
                </Button>
                {balance(charge) > 0 && (
                  <Dialog
                    title="Record a payment"
                    description={`Record a payment from ${member.name}. Outstanding: ${money(balance(charge))}.`}
                    trigger={
                      <Button size="sm">
                        <Plus />
                        Record payment
                      </Button>
                    }
                  >
                    <ActionForm action="payment" submit="Record payment">
                      <input type="hidden" name="chargeId" value={charge.id} />
                      <input
                        type="hidden"
                        name="requestId"
                        value={randomUUID()}
                      />
                      <label className="field">
                        Amount (₹)
                        <Input
                          required
                          name="amount"
                          inputMode="decimal"
                          defaultValue={(balance(charge) / 100).toFixed(2)}
                        />
                      </label>
                      <label className="field">
                        Payment method
                        <NativeSelect name="method">
                          <option value="UPI">UPI</option>
                          <option value="CASH">Cash</option>
                          <option value="BANK">Bank transfer</option>
                        </NativeSelect>
                      </label>
                      <label className="field">
                        Reference (optional)
                        <Input
                          name="reference"
                          maxLength={200}
                          placeholder="UTR or receipt reference"
                        />
                      </label>
                    </ActionForm>
                  </Dialog>
                )}
                {owner &&
                  !charge.voidedAt &&
                  balance(charge) === charge.amountPaise && (
                    <Dialog
                      title="Waive this charge"
                      description="This removes the unpaid fee while retaining a record of the charge. It does not cancel the membership."
                      trigger={
                        <Button size="sm" variant="ghost">
                          Waive charge
                        </Button>
                      }
                    >
                      <ActionForm
                        action="waive-charge"
                        submit="Waive charge"
                        variant="destructive"
                      >
                        <input
                          type="hidden"
                          name="chargeId"
                          value={charge.id}
                        />
                        <label className="field">
                          Reason
                          <Input name="reason" required minLength={5} />
                        </label>
                      </ActionForm>
                    </Dialog>
                  )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <span className="text-[11px] text-muted-foreground">
            {payments.length} entries
          </span>
        </CardHeader>
        {payments.length ? (
          <div className="table-wrap">
            <table className="data-table" aria-label="Member payment history">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Membership</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="whitespace-nowrap">
                      {dateLabel(payment.createdAt)}
                    </td>
                    <td>{payment.plan}</td>
                    <td>
                      {payment.amountPaise < 0 ? "Reversal" : payment.method}
                    </td>
                    <td
                      className="max-w-40 truncate"
                      title={payment.reference || undefined}
                    >
                      {payment.reference || "—"}
                    </td>
                    <td
                      className={
                        payment.amountPaise < 0
                          ? "text-destructive"
                          : "text-primary"
                      }
                    >
                      {money(payment.amountPaise)}
                    </td>
                    <td>
                      <Link
                        href={`/receipts/${payment.id}`}
                        className="text-primary"
                        aria-label={`Receipt for payment on ${dateLabel(payment.createdAt)}`}
                      >
                        View ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No payments recorded yet.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
