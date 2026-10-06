import {
  addDays,
  atHourIST,
  dayString,
  daysBetween,
  parseDay,
  todayIST,
} from "./domain";

export const reportTypes = {
  members: "Member list",
  collections: "Collections",
  outstanding: "Dues & outstanding",
  renewals: "Renewals",
  attendance: "Attendance",
} as const;
export type ReportType = keyof typeof reportTypes;
export const reportPeriods = {
  "this-month": "This month",
  "last-month": "Last month",
  "this-week": "This week",
  "last-week": "Last week",
  "next-30": "Next 30 days",
  custom: "Custom dates",
} as const;
export const reportStatuses = {
  all: "All members",
  active: "Active",
  upcoming: "Upcoming",
  expired: "Expired",
  "no-plan": "No plan",
} as const;
export const paymentMethods = ["CASH", "UPI", "BANK"] as const;
export type ReportParams = Record<string, string | string[] | undefined>;
export type ReportFilters = {
  type: ReportType;
  period: keyof typeof reportPeriods;
  from: string;
  to: string;
  group: "day" | "week" | "month";
  q: string;
  status: keyof typeof reportStatuses;
  plan: string;
  method: string;
  dues: "all" | "overdue" | "current";
  renewal: "all" | "needed" | "booked";
  page: number;
};
export class ReportFilterError extends Error {}
export function hasReportDates(type: ReportType) {
  return type !== "members" && type !== "outstanding";
}
export function reportRange(
  period: keyof typeof reportPeriods,
  today = todayIST(),
) {
  const month = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );
  const monday = addDays(today, -((today.getUTCDay() + 6) % 7));
  switch (period) {
    case "this-week":
      return { from: monday, to: addDays(monday, 6) };
    case "last-week":
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case "last-month":
      return {
        from: new Date(
          Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1),
        ),
        to: addDays(month, -1),
      };
    case "next-30":
      return { from: today, to: addDays(today, 29) };
    default:
      return {
        from: month,
        to: new Date(
          Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
        ),
      };
  }
}
export function parseReportFilters(
  params: ReportParams,
  today = todayIST(),
): ReportFilters {
  const value = (key: string) =>
    typeof params[key] === "string" ? params[key] : "";
  const type = Object.hasOwn(reportTypes, value("type"))
    ? (value("type") as ReportType)
    : "members";
  // "Next 30 days" is only offered for renewals; elsewhere it would show an
  // empty future range under a mismatched Period label.
  const requested = value("period");
  const period =
    Object.hasOwn(reportPeriods, requested) &&
    (requested !== "next-30" || type === "renewals")
      ? (requested as ReportFilters["period"])
      : type === "renewals"
        ? "next-30"
        : "this-month";
  let range = reportRange(period, today);
  if (period === "custom" && hasReportDates(type)) {
    try {
      range = { from: parseDay(value("from")), to: parseDay(value("to")) };
    } catch {
      throw new ReportFilterError("Choose valid start and end dates.");
    }
    if (range.from > range.to)
      throw new ReportFilterError(
        "The end date must be on or after the start date.",
      );
    if (daysBetween(range.to, range.from) >= 366)
      throw new ReportFilterError("Choose a date range of up to 366 days.");
  }
  const page = Number(value("page"));
  return {
    type,
    period,
    from: dayString(range.from),
    to: dayString(range.to),
    group:
      value("group") === "day" || value("group") === "week"
        ? (value("group") as ReportFilters["group"])
        : "month",
    q: value("q").trim().slice(0, 100),
    status: Object.hasOwn(reportStatuses, value("status"))
      ? (value("status") as ReportFilters["status"])
      : "all",
    plan: value("plan").slice(0, 100),
    method: paymentMethods.includes(
      value("method") as (typeof paymentMethods)[number],
    )
      ? value("method")
      : "",
    dues:
      value("dues") === "overdue" || value("dues") === "current"
        ? (value("dues") as ReportFilters["dues"])
        : "all",
    renewal:
      value("renewal") === "needed" || value("renewal") === "booked"
        ? (value("renewal") as ReportFilters["renewal"])
        : "all",
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1,
  };
}
export function reportBounds(filters: ReportFilters) {
  return {
    gte: atHourIST(parseDay(filters.from), 0),
    lt: atHourIST(addDays(parseDay(filters.to), 1), 0),
  };
}
export function reportQuery(
  filters: ReportFilters,
  changes: Partial<ReportFilters> = {},
) {
  const next = { ...filters, ...changes };
  return new URLSearchParams(
    Object.entries(next).map(([key, value]) => [key, String(value)]),
  ).toString();
}

// Only textual cells can contain formulas. Numeric report cells remain numeric,
// including negative net collections, so spreadsheet totals work correctly.
export function reportCsvCell(value: string, numeric = false) {
  const safe =
    !numeric && /^\s*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
