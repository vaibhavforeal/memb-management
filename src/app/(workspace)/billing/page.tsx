import { redirect } from "next/navigation";
import { getContext, currentUser } from "@/lib/context";
import { db } from "@/lib/db";
import {
  dateLabel,
  money,
  renewalStart,
  termEnd,
  todayIST,
} from "@/lib/domain";
import { razorpayAvailable } from "@/lib/razorpay";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BusinessCheckout } from "@/components/business-checkout";
import {
  hasWorkspaceAccess,
  workspaceAccess,
  trialDateLabel,
} from "@/lib/workspace-access";

export default async function BillingPage() {
  const ctx = await getContext({ allowExpired: true });
  if (ctx.role !== "OWNER") redirect("/dashboard");
  const [business, user, orders] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: ctx.businessId } }),
    currentUser(),
    db.businessBillingOrder.findMany({
      where: { businessId: ctx.businessId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const available = razorpayAvailable();
  const access = workspaceAccess(business);
  const paid =
    business.billingPaidThrough && business.billingPaidThrough >= todayIST();
  const start = renewalStart(business.billingPaidThrough);
  const end = termEnd(start, 1);
  const pending = orders.find(
    (o) => !o.paidAt && o.razorpayKeyId === process.env.RAZORPAY_KEY_ID?.trim(),
  );
  return (
    <>
      <PageHeading title="Business billing" />
      {business.trialRequired && (
        <Card className="mb-4">
          <CardContent className="space-y-2 pt-5">
            <p className="font-semibold">
              {access === "PAID"
                ? "Your paid plan is active"
                : access === "TRIAL"
                  ? "Your three-day free trial is active"
                  : access === "PAYMENT_DUE"
                    ? "Renew your paid plan"
                    : "Your free trial has ended"}
            </p>
            {access === "TRIAL" && business.trialEndsAt && (
              <p className="text-sm text-muted-foreground">
                Trial ends {trialDateLabel(business.trialEndsAt)}.
              </p>
            )}
            {!hasWorkspaceAccess(business) && (
              <p className="text-sm text-muted-foreground">
                Pay to restore workspace access.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Monthly workspace fee</CardTitle>
          <Badge>
            {business.monthlyFeePaise === null
              ? "Not configured"
              : paid
                ? "Paid"
                : "Payment due"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {business.monthlyFeePaise === null ? (
            <p className="text-sm text-muted-foreground">
              The platform administrator has not enabled monthly billing for
              this business.
            </p>
          ) : (
            <>
              <p className="text-3xl font-semibold">
                {money(business.monthlyFeePaise)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  per month
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Monthly payment · No automatic renewal
              </p>
              <p className="text-sm">
                Next payment covers {dateLabel(start)} – {dateLabel(end)}.
              </p>
            </>
          )}
          {business.billingPaidThrough && (
            <p className="text-sm">
              Paid through{" "}
              <strong>{dateLabel(business.billingPaidThrough)}</strong>.
            </p>
          )}
          {!available && (
            <p className="text-sm text-muted-foreground">
              Online payments are awaiting platform setup. Contact the platform
              administrator.
            </p>
          )}
          {available &&
            process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") && (
              <p className="text-sm text-amber-800">
                Test mode — no real money will be charged.
              </p>
            )}
          {ctx.support ? (
            <p className="text-sm text-muted-foreground">
              Payments must be made by the business owner outside a support
              session.
            </p>
          ) : (
            <BusinessCheckout
              amountPaise={business.monthlyFeePaise}
              businessName={business.name}
              user={{ name: user.name, email: user.email }}
              pendingOrderId={pending?.id}
              enabled={available}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent billing history</CardTitle>
        </CardHeader>
        <CardContent>
          {!orders.length ? (
            <p className="text-sm text-muted-foreground">
              Your business payments will appear here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-3">Created</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Billing period</th>
                    <th className="p-3">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap p-3">
                        {dateLabel(order.createdAt)}
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {money(order.amountPaise)}
                      </td>
                      <td className="p-3">
                        <Badge>{order.paidAt ? "Paid" : "Unpaid"}</Badge>
                        {order.razorpayKeyId.startsWith("rzp_test_") && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            Test
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {order.periodStart && order.periodEnd
                          ? `${dateLabel(order.periodStart)} – ${dateLabel(order.periodEnd)}`
                          : "Awaiting payment"}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {order.razorpayPaymentId ?? order.razorpayOrderId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {orders.length === 30 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the latest 30 billing orders.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
