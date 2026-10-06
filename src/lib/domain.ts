import { z } from "zod";
export const DAY = 86_400_000;
export function todayIST(now = new Date()) {
  return new Date(
    new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10) +
      "T00:00:00Z",
  );
}
export function dayString(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Choose a valid date.");
  const d = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || dayString(d) !== value)
    throw new Error("Choose a valid date.");
  return d;
}
export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY);
}
export function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / DAY);
}
export function termEnd(start: Date, months: number) {
  const end = new Date(start);
  const originalDay = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(originalDay, lastDay));
  return addDays(end, -1);
}
export function renewalStart(end: Date | null, today = todayIST()) {
  return end && end >= today ? addDays(end, 1) : today;
}
export function atHourIST(day: Date, hour: number) {
  return new Date(day.getTime() + hour * 3_600_000 - 330 * 60_000);
}
export function toPaise(value: string) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter a valid rupee amount with up to two decimals.");
  const [whole, fraction = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
}
export function dateLabel(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(date));
}
export function normalizePhone(value: string) {
  let n = value.replace(/[\s()+-]/g, "");
  if (/^[6-9]\d{9}$/.test(n)) n = "91" + n;
  if (!/^91[6-9]\d{9}$/.test(n))
    throw new Error("Enter a valid Indian mobile number.");
  return "+" + n;
}
export function balance(charge: {
  amountPaise: number;
  voidedAt?: Date | null;
  payments: { amountPaise: number }[];
}) {
  return (
    (charge.voidedAt ? 0 : charge.amountPaise) -
    charge.payments.reduce((s, p) => s + p.amountPaise, 0)
  );
}
export function membershipStatus(
  terms: { startDate: Date; endDate: Date; cancelledAt: Date | null }[],
  today = todayIST(),
) {
  if (
    terms.some(
      (t) => !t.cancelledAt && t.startDate <= today && t.endDate >= today,
    )
  )
    return "Active";
  if (terms.some((t) => !t.cancelledAt && t.startDate > today))
    return "Upcoming";
  return terms.length ? "Expired" : "No plan";
}
export const memberInput = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().transform((value, ctx) => {
    try {
      return normalizePhone(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid Indian mobile number.",
      });
      return z.NEVER;
    }
  }),
  email: z.union([z.email(), z.literal("")]).optional(),
  notes: z.string().max(2000).default(""),
});
export type MemberInput = z.input<typeof memberInput>;
export const allowedParameters = [
  "name",
  "business",
  "expiry",
  "amount",
  "due",
  "date",
];
export function nextDeliveryStatus(current: string, incoming: string) {
  const rank: Record<string, number> = {
    QUEUED: 0,
    PROCESSING: 1,
    UNKNOWN: 1,
    FAILED: 1,
    SENT: 2,
    DELIVERED: 3,
    READ: 4,
  };
  if (!(incoming in rank) || ["SUPPRESSED", "SIMULATED"].includes(current))
    return current;
  if (incoming === "FAILED")
    return ["DELIVERED", "READ"].includes(current) ? current : "FAILED";
  return (rank[incoming] ?? 0) > (rank[current] ?? 0) ? incoming : current;
}
