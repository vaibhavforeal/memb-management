/** One CSV cell. Strings starting with a formula trigger get a leading `'`. */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Paise to a rupee string with two decimals, using integer math only. */
export function rupees(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(paise));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export type OrderCsvRow = {
  createdAt: Date;
  workspace: string;
  amountPaise: number;
  paidAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
};

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function ordersCsv(rows: OrderCsvRow[]): string {
  const lines = [
    [
      "Created",
      "Workspace",
      "Amount (INR)",
      "Status",
      "Period start",
      "Period end",
      "Razorpay order",
      "Razorpay payment",
    ].join(","),
    ...rows.map((r) =>
      [
        r.createdAt.toISOString(),
        r.workspace,
        rupees(r.amountPaise),
        r.paidAt ? "Paid" : "Pending",
        day(r.periodStart),
        day(r.periodEnd),
        r.razorpayOrderId,
        r.razorpayPaymentId,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return lines.join("\r\n") + "\r\n";
}
