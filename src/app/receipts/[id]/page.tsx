import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { readMemberBill } from "@/lib/member-documents";
import { BillDocument } from "@/components/member-document";
import { DocumentPreview } from "@/components/document-preview";
import { ActionForm } from "@/components/action-form";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = {
  title: "Payment receipt",
  robots: { index: false, follow: false },
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getContext(),
    { id } = await params;
  const payment = await db.payment.findFirst({
    where: { id, businessId: ctx.businessId },
  });
  if (!payment) notFound();
  const bill = await readMemberBill(ctx, payment.chargeId);
  if (!bill) notFound();
  const reversal = bill.payments.find(
    (entry) => entry.reversalOfId === payment.id,
  );
  return (
    <main className="document-page mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/members/${bill.memberId}?tab=payments`}
        className="no-print mb-5 inline-block text-sm text-muted-foreground"
      >
        ← Back to member
      </Link>
      <DocumentPreview
        kind="receipt"
        width={1000}
        filename={`${bill.member.code}-receipt-${payment.id}`}
      >
        <BillDocument bill={bill} payment={payment} reversal={reversal} />
      </DocumentPreview>
      {ctx.role === "OWNER" && payment.amountPaise > 0 && !reversal && (
        <div className="no-print mt-6">
          <Dialog
            title="Reverse this payment?"
            description="A matching negative entry will be recorded. The original payment will remain visible."
            trigger={
              <Button variant="destructive">Correct this payment</Button>
            }
          >
            <ActionForm
              action="reverse-payment"
              submit="Record reversal"
              variant="destructive"
            >
              <input type="hidden" name="paymentId" value={payment.id} />
              <label className="field">
                Reason for correction
                <Input required minLength={5} maxLength={500} name="reason" />
              </label>
            </ActionForm>
          </Dialog>
        </div>
      )}
    </main>
  );
}
