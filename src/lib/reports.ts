import { Prisma } from "@prisma/client";
import { db } from "./db";
import { assertActive, ownerOnly, type TenantContext } from "./context";
import { dateLabel, dayString, money, parseDay, todayIST } from "./domain";
import {
  directoryBase,
  directoryFilterSql,
  likePattern,
} from "./member-directory";
import {
  reportBounds,
  reportCsvCell,
  type ReportFilters,
} from "./report-filters";

type Cell = string | number | bigint | Date | null;
export type ReportRow = {
  id: string;
  memberId?: string;
  [key: string]: Cell | undefined;
};
export type ReportColumn = {
  key: string;
  label: string;
  // "date" is a stored calendar day; "datetime" is an instant shown as its IST day.
  kind?: "money" | "date" | "datetime" | "number";
};
type Metric = { label: string; value: number; money?: boolean };
type Definition = {
  base: Prisma.Sql;
  order: Prisma.Sql;
  summary: Prisma.Sql;
  columns: ReportColumn[];
  metrics: { key: string; label: string; money?: boolean }[];
  note: string;
};
const memberColumns: ReportColumn[] = [
  { key: "code", label: "Member ID" },
  { key: "name", label: "Member" },
  { key: "phone", label: "Phone" },
];
const date = (key: string, label: string): ReportColumn => ({
  key,
  label,
  kind: "date",
});
const amount = (key: string, label: string): ReportColumn => ({
  key,
  label,
  kind: "money",
});
const number = (key: string, label: string): ReportColumn => ({
  key,
  label,
  kind: "number",
});
function definition(
  ctx: TenantContext,
  f: ReportFilters,
  today: Date,
): Definition {
  const businessId = ctx.businessId,
    bounds = reportBounds(f);
  if (f.type === "members") {
    // Statuses are the labels produced by the directory's own status CASE.
    const status = {
      all: "",
      active: "Active",
      upcoming: "Upcoming",
      expired: "Expired",
      "no-plan": "No plan",
    }[f.status];
    return {
      base: Prisma.sql`${directoryBase(businessId, today)}, report AS (
        SELECT *, id AS "memberId" FROM directory WHERE ${directoryFilterSql(f)}
        AND ${status ? Prisma.sql`status = ${status}` : Prisma.sql`true`})`,
      order: Prisma.sql`LOWER(name), id`,
      summary: Prisma.sql`COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'Active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'Expired')::int AS expired, COALESCE(SUM(outstanding), 0)::bigint AS outstanding`,
      columns: [
        ...memberColumns,
        { key: "email", label: "Email" },
        { key: "status", label: "Status" },
        { key: "planName", label: "Plan" },
        { key: "createdAt", label: "Joined", kind: "datetime" },
        date("endDate", "Expiry"),
        amount("outstanding", "Outstanding (INR)"),
      ],
      metrics: [
        { key: "total", label: "Members" },
        { key: "active", label: "Active" },
        { key: "expired", label: "Expired" },
        { key: "outstanding", label: "Outstanding", money: true },
      ],
      note: "Current member list, excluding archived members. Plan and status reflect today; early renewals do not replace the active plan.",
    };
  }
  const query = likePattern(f.q);
  const search = f.q
    ? Prisma.sql`(m.name ILIKE ${query} OR m.code ILIKE ${query} OR contact.phone ILIKE ${query})`
    : Prisma.sql`true`;
  if (f.type === "collections") {
    const step =
      f.group === "day" ? "1 day" : f.group === "week" ? "1 week" : "1 month";
    return {
      base: Prisma.sql`WITH entries AS (
        SELECT p.*, date_trunc(${f.group}, p."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') AS bucket
        FROM "Payment" p JOIN "Charge" c ON c.id = p."chargeId" AND c."businessId" = p."businessId"
        JOIN "Member" m ON m.id = c."memberId" AND m."businessId" = c."businessId"
        JOIN "Contact" contact ON contact.id = m."contactId" AND contact."businessId" = m."businessId"
        WHERE p."businessId" = ${businessId} AND p."createdAt" >= ${bounds.gte} AND p."createdAt" < ${bounds.lt}
        AND ${search} AND ${f.method ? Prisma.sql`p.method = ${f.method}` : Prisma.sql`true`}
      ), periods AS (
        SELECT generate_series(date_trunc(${f.group}, ${parseDay(f.from)}::timestamp),
          date_trunc(${f.group}, ${parseDay(f.to)}::timestamp), ${step}::interval) AS bucket
      ), report AS (
        SELECT periods.bucket::text AS id, GREATEST(periods.bucket, ${parseDay(f.from)}::timestamp) AS "periodStart",
          LEAST(periods.bucket + ${step}::interval - interval '1 day', ${parseDay(f.to)}::timestamp) AS "periodEnd",
          COUNT(e.id)::int AS entries, COALESCE(SUM(GREATEST(e."amountPaise", 0)), 0)::bigint AS gross,
          COALESCE(SUM(GREATEST(-e."amountPaise", 0)), 0)::bigint AS reversals,
          COALESCE(SUM(e."amountPaise"), 0)::bigint AS net
        FROM periods LEFT JOIN entries e ON e.bucket = periods.bucket GROUP BY periods.bucket
      )`,
      order: Prisma.sql`"periodStart" DESC, id`,
      summary: Prisma.sql`COUNT(*)::int AS total, COALESCE(SUM(entries), 0)::bigint AS entries,
        COALESCE(SUM(gross), 0)::bigint AS gross, COALESCE(SUM(reversals), 0)::bigint AS reversals, COALESCE(SUM(net), 0)::bigint AS net`,
      columns: [
        date("periodStart", "From"),
        date("periodEnd", "To"),
        number("entries", "Ledger entries"),
        amount("gross", "Received (INR)"),
        amount("reversals", "Reversed (INR)"),
        amount("net", "Net collections (INR)"),
      ],
      metrics: [
        { key: "gross", label: "Received", money: true },
        { key: "reversals", label: "Reversed", money: true },
        { key: "net", label: "Net collections", money: true },
        { key: "entries", label: "Ledger entries" },
      ],
      note: "Receipts and reversals use their recorded date in IST. Weeks run Monday–Sunday; first and last periods are clipped to your dates. Zero-activity periods are included.",
    };
  }
  if (f.type === "outstanding") {
    return {
      base: Prisma.sql`WITH paid AS (
        SELECT "chargeId", SUM("amountPaise") AS amount FROM "Payment" WHERE "businessId" = ${businessId} GROUP BY "chargeId"
      ), balances AS (
        SELECT c.id, m.id AS "memberId", m.code, m.name, contact.phone, c.description, c."dueDate", c."amountPaise" AS charged,
          COALESCE(p.amount, 0)::bigint AS paid, GREATEST(0, c."amountPaise" - COALESCE(p.amount, 0))::bigint AS outstanding,
          GREATEST(0, ${today}::date - c."dueDate")::int AS days,
          CASE WHEN c."dueDate" >= ${today} THEN 'Current'
            WHEN ${today}::date - c."dueDate" <= 30 THEN '1–30 days'
            WHEN ${today}::date - c."dueDate" <= 60 THEN '31–60 days'
            WHEN ${today}::date - c."dueDate" <= 90 THEN '61–90 days' ELSE '90+ days' END AS ageing,
          CASE WHEN m.archived THEN 'Archived' ELSE 'Current' END AS "memberState"
        FROM "Charge" c JOIN "Member" m ON m.id = c."memberId" AND m."businessId" = c."businessId"
        JOIN "Contact" contact ON contact.id = m."contactId" AND contact."businessId" = m."businessId"
        LEFT JOIN paid p ON p."chargeId" = c.id
        WHERE c."businessId" = ${businessId} AND c."voidedAt" IS NULL AND ${search}
      ), report AS (SELECT * FROM balances WHERE outstanding > 0 AND
        ${f.dues === "overdue" ? Prisma.sql`days > 0` : f.dues === "current" ? Prisma.sql`days = 0` : Prisma.sql`true`})`,
      order: Prisma.sql`"dueDate", LOWER(name), id`,
      summary: Prisma.sql`COUNT(*)::int AS total, COUNT(DISTINCT "memberId")::int AS members,
        COALESCE(SUM(outstanding), 0)::bigint AS outstanding,
        COALESCE(SUM(outstanding) FILTER (WHERE days > 0), 0)::bigint AS overdue,
        COALESCE(SUM(outstanding) FILTER (WHERE days > 90), 0)::bigint AS old`,
      columns: [
        ...memberColumns,
        { key: "memberState", label: "Member record" },
        { key: "description", label: "Charge" },
        date("dueDate", "Due date"),
        { key: "ageing", label: "Ageing" },
        amount("charged", "Charged (INR)"),
        amount("paid", "Net paid (INR)"),
        amount("outstanding", "Outstanding (INR)"),
      ],
      metrics: [
        { key: "outstanding", label: "Outstanding", money: true },
        { key: "overdue", label: "Overdue", money: true },
        { key: "old", label: "Over 90 days", money: true },
        { key: "members", label: "Members with dues" },
      ],
      note: "Current unpaid balances after all payments and reversals. Includes archived members and cancelled terms; waived charges are excluded. Due today and future charges are current, not overdue.",
    };
  }
  if (f.type === "renewals") {
    return {
      base: Prisma.sql`WITH terms AS (
        SELECT t.id, m.id AS "memberId", m.code, m.name, contact.phone, t."planName", t."startDate", t."endDate",
          (SELECT MIN(n."startDate") FROM "Membership" n WHERE n."businessId" = ${businessId}
            AND n."memberId" = m.id AND n."cancelledAt" IS NULL AND n."startDate" > t."endDate") AS "nextStart"
        FROM "Membership" t JOIN "Member" m ON m.id = t."memberId" AND m."businessId" = t."businessId"
        JOIN "Contact" contact ON contact.id = m."contactId" AND contact."businessId" = m."businessId"
        WHERE t."businessId" = ${businessId} AND t."cancelledAt" IS NULL AND NOT m.archived
          AND t."endDate" >= ${parseDay(f.from)} AND t."endDate" <= ${parseDay(f.to)} AND ${search}
          AND ${f.plan ? Prisma.sql`t."planId" = ${f.plan}` : Prisma.sql`true`}
      ), report AS (SELECT *, CASE WHEN "nextStart" IS NULL THEN 'Needs renewal' ELSE 'Next term booked' END AS status
        FROM terms WHERE ${f.renewal === "needed" ? Prisma.sql`"nextStart" IS NULL` : f.renewal === "booked" ? Prisma.sql`"nextStart" IS NOT NULL` : Prisma.sql`true`})`,
      order: Prisma.sql`"endDate", LOWER(name), id`,
      summary: Prisma.sql`COUNT(*)::int AS total, COUNT(DISTINCT "memberId")::int AS members,
        COUNT(*) FILTER (WHERE "nextStart" IS NULL)::int AS needed, COUNT(*) FILTER (WHERE "nextStart" IS NOT NULL)::int AS booked`,
      columns: [
        ...memberColumns,
        { key: "planName", label: "Plan" },
        date("startDate", "Term starts"),
        date("endDate", "Expires"),
        { key: "status", label: "Renewal status" },
        date("nextStart", "Next term starts"),
      ],
      metrics: [
        { key: "total", label: "Terms expiring" },
        { key: "members", label: "Members" },
        { key: "needed", label: "Need renewal" },
        { key: "booked", label: "Next term booked" },
      ],
      note: "Membership terms ending in the selected dates, excluding cancelled terms and archived members. Booking status reflects all currently recorded renewals; check the next start date for any gap.",
    };
  }
  return {
    base: Prisma.sql`WITH report AS (
      SELECT m.id, m.id AS "memberId", m.code, m.name, contact.phone, COUNT(*)::int AS visits,
        MIN(c.day) AS first, MAX(c.day) AS last
      FROM "Checkin" c JOIN "Member" m ON m.id = c."memberId" AND m."businessId" = c."businessId"
      JOIN "Contact" contact ON contact.id = m."contactId" AND contact."businessId" = m."businessId"
      WHERE c."businessId" = ${businessId} AND c.day >= ${parseDay(f.from)} AND c.day <= ${parseDay(f.to)} AND ${search}
      GROUP BY m.id, m.code, m.name, contact.phone
    )`,
    order: Prisma.sql`visits DESC, LOWER(name), id`,
    summary: Prisma.sql`COUNT(*)::int AS total, COALESCE(SUM(visits), 0)::bigint AS visits, COALESCE(MAX(visits), 0)::int AS highest`,
    columns: [
      ...memberColumns,
      number("visits", "Check-ins"),
      date("first", "First visit"),
      date("last", "Last visit"),
    ],
    metrics: [
      { key: "total", label: "Members who visited" },
      { key: "visits", label: "Total check-ins" },
      { key: "highest", label: "Most visits by a member" },
    ],
    note: "One check-in per member per IST day. Includes historical visits from members who are now archived; members with no visits in this period are excluded.",
  };
}
export async function getReport(ctx: TenantContext, filters: ReportFilters) {
  await assertActive(ctx);
  const today = todayIST(),
    def = definition(ctx, filters, today);
  const result = await db.$transaction(
    async (tx) => {
      const [summary] = await tx.$queryRaw<Record<string, number | bigint>[]>(
        Prisma.sql`${def.base} SELECT ${def.summary} FROM report`,
      );
      const total = Number(summary.total),
        pages = Math.max(1, Math.ceil(total / 25)),
        page = Math.min(filters.page, pages);
      const rows = await tx.$queryRaw<ReportRow[]>(
        Prisma.sql`${def.base} SELECT * FROM report ORDER BY ${def.order} LIMIT 25 OFFSET ${(page - 1) * 25}`,
      );
      const metrics: Metric[] = def.metrics.map((metric) => ({
        ...metric,
        value: Number(summary[metric.key] ?? 0),
      }));
      return { rows, metrics, total, pages, page };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  return { ...result, columns: def.columns, note: def.note, today };
}
export function reportCell(row: ReportRow, column: ReportColumn, csv = false) {
  const value = row[column.key];
  if (value === undefined || value === null) return csv ? "" : "—";
  if (column.kind === "money")
    return csv ? (Number(value) / 100).toFixed(2) : money(Number(value));
  if (column.kind === "date" || column.kind === "datetime") {
    if (!csv) return dateLabel(String(value));
    const instant = new Date(String(value));
    return dayString(column.kind === "datetime" ? todayIST(instant) : instant);
  }
  return String(value);
}
export async function* exportReport(
  ctx: TenantContext,
  filters: ReportFilters,
) {
  ownerOnly(ctx);
  await assertActive(ctx);
  const def = definition(ctx, filters, todayIST());
  // Every page is read from one RepeatableRead snapshot, like getReport, so a
  // concurrent edit cannot shift OFFSET boundaries and duplicate or drop rows.
  // The CSV is built before the first yield, so a failure happens before any
  // bytes are sent and the caller can audit a complete export.
  const pages = await db.$transaction(
    async (tx) => {
      const out: string[] = [];
      for (let offset = 0; ; offset += 500) {
        const rows = await tx.$queryRaw<ReportRow[]>(
          Prisma.sql`${def.base} SELECT * FROM report ORDER BY ${def.order} LIMIT 500 OFFSET ${offset}`,
        );
        if (!rows.length) break;
        out.push(
          rows
            .map(
              (row) =>
                def.columns
                  .map((column) =>
                    reportCsvCell(
                      reportCell(row, column, true),
                      column.kind === "money" || column.kind === "number",
                    ),
                  )
                  .join(",") + "\r\n",
            )
            .join(""),
        );
      }
      return out;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 60_000,
    },
  );
  yield "\uFEFF" +
    def.columns.map((c) => reportCsvCell(c.label)).join(",") +
    "\r\n";
  yield* pages;
}
