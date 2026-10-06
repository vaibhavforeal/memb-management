import { balance, todayIST } from "./domain";

export function documentMoney(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function billTotals(charge: {
  amountPaise: number;
  taxPaise: number;
  voidedAt: Date | null;
  payments: { amountPaise: number }[];
}) {
  const paid = charge.payments.reduce(
    (sum, payment) => sum + payment.amountPaise,
    0,
  );
  const due = balance(charge);
  return {
    paid,
    due,
    taxable: charge.amountPaise - charge.taxPaise,
    payable: charge.voidedAt ? 0 : charge.amountPaise,
    status: charge.voidedAt
      ? "Waived"
      : due < 0
        ? "Credit balance"
        : charge.amountPaise === 0
          ? "No payment required"
          : due === 0
            ? "Paid in full"
            : paid > 0
              ? "Part paid"
              : "Unpaid",
  };
}

type Term = { startDate: Date; endDate: Date; cancelledAt: Date | null };
export function cardTerm<T extends Term>(
  terms: T[],
  archived = false,
  today = todayIST(),
) {
  const ordered = [...terms].sort(
    (a, b) => b.startDate.getTime() - a.startDate.getTime(),
  );
  const active = ordered.find(
    (t) => !t.cancelledAt && t.startDate <= today && t.endDate >= today,
  );
  const upcoming = [...ordered]
    .reverse()
    .find((t) => !t.cancelledAt && t.startDate > today);
  const term =
    active ??
    upcoming ??
    ordered.find((t) => !t.cancelledAt) ??
    ordered[0] ??
    null;
  const status = archived
    ? "Archived"
    : !term
      ? "No plan"
      : term.cancelledAt
        ? "Cancelled"
        : active
          ? "Active"
          : upcoming
            ? "Upcoming"
            : "Expired";
  return { term, status };
}
