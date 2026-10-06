import { money } from "@/lib/domain";

type ChargeBreakdownData = {
  amountPaise: number;
  baseAmountPaise: number | null;
  admissionFeePaise: number;
  discountType: string;
  discountValue: number;
  discountPaise: number;
  discountReason?: string;
  taxRateBps: number;
  taxInclusive: boolean;
  taxPaise: number;
};

export function ChargeBreakdown({ bill }: { bill: ChargeBreakdownData }) {
  const rows: [string, string][] = [
    ["Membership fee", money(bill.baseAmountPaise ?? bill.amountPaise)],
  ];
  if (bill.admissionFeePaise > 0)
    rows.push(["Admission fee", money(bill.admissionFeePaise)]);
  if (bill.discountPaise > 0)
    rows.push([
      `Discount${bill.discountType === "PERCENT" ? ` (${bill.discountValue / 100}%)` : ""}`,
      `−${money(bill.discountPaise)}`,
    ]);
  if (bill.taxRateBps > 0) {
    if (bill.taxInclusive)
      rows.push(["Amount before tax", money(bill.amountPaise - bill.taxPaise)]);
    rows.push([
      `Tax (${bill.taxRateBps / 100}%${bill.taxInclusive ? ", included" : ""})`,
      money(bill.taxPaise),
    ]);
  }
  return (
    <div className="space-y-2">
      <dl className="space-y-2 text-sm" aria-label="Charge breakdown">
        {rows.map(([label, value]) => (
          <div className="flex justify-between gap-4" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="shrink-0 tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
          <dt>Charge total</dt>
          <dd className="tabular-nums">{money(bill.amountPaise)}</dd>
        </div>
      </dl>
      {bill.discountReason && (
        <p className="break-words text-xs text-muted-foreground">
          Discount reason: {bill.discountReason}
        </p>
      )}
    </div>
  );
}
