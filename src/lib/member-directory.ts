import { Prisma } from "@prisma/client";
import { db } from "./db";
import { assertActive, type TenantContext } from "./context";
import { addDays, todayIST } from "./domain";

export const memberStatuses = [
  "all",
  "active",
  "expiring",
  "expired",
  "unpaid",
] as const;
export type MemberStatusFilter = (typeof memberStatuses)[number];
export const memberSorts = {
  "joined-desc": "Newest joined",
  "joined-asc": "Oldest joined",
  "name-asc": "Name A–Z",
  "name-desc": "Name Z–A",
  "expiry-asc": "Expiry: soonest first",
  "expiry-desc": "Expiry: latest first",
} as const;
export type DirectoryParams = Record<string, string | string[] | undefined>;
export type DirectoryFilters = {
  q: string;
  status: MemberStatusFilter;
  plan: string;
  fees: "all" | "unpaid" | "settled";
  sort: keyof typeof memberSorts;
  page: number;
};
export function parseDirectoryFilters(
  params: DirectoryParams,
): DirectoryFilters {
  const value = (key: string) =>
    typeof params[key] === "string" ? params[key] : "";
  const status = value("status"),
    fees = value("fees"),
    sort = value("sort"),
    page = Number(value("page"));
  return {
    q: value("q").trim().slice(0, 100),
    status: memberStatuses.includes(status as MemberStatusFilter)
      ? (status as MemberStatusFilter)
      : "all",
    plan: value("plan").slice(0, 100),
    fees: fees === "unpaid" || fees === "settled" ? fees : "all",
    sort: Object.hasOwn(memberSorts, sort)
      ? (sort as keyof typeof memberSorts)
      : "joined-desc",
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1,
  };
}
export function directoryQuery(
  filters: DirectoryFilters,
  changes: Partial<DirectoryFilters> = {},
) {
  const f = { ...filters, ...changes },
    query = new URLSearchParams();
  if (f.q) query.set("q", f.q);
  if (f.status !== "all") query.set("status", f.status);
  if (f.plan) query.set("plan", f.plan);
  if (f.fees !== "all") query.set("fees", f.fees);
  if (f.sort !== "joined-desc") query.set("sort", f.sort);
  if (f.page > 1) query.set("page", String(f.page));
  return query.toString();
}
export type DirectoryMember = {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: Date;
  planId: string | null;
  planName: string | null;
  endDate: Date | null;
  status: "Active" | "Upcoming" | "Expired" | "No plan";
  outstanding: bigint;
  expiring: boolean;
};
export type DirectoryCounts = Record<MemberStatusFilter, number>;

// The displayed/filterable term is active, next scheduled, last expired, then
// cancelled. An early renewal must not replace today's plan in the directory.
export function directoryBase(businessId: string, today: Date) {
  return Prisma.sql`WITH terms AS (
    SELECT DISTINCT ON (t."memberId") t.* FROM "Membership" t WHERE t."businessId" = ${businessId}
    ORDER BY t."memberId", CASE
      WHEN t."cancelledAt" IS NULL AND t."startDate" <= ${today} AND t."endDate" >= ${today} THEN 0
      WHEN t."cancelledAt" IS NULL AND t."startDate" > ${today} THEN 1
      WHEN t."cancelledAt" IS NULL THEN 2 ELSE 3 END,
      CASE WHEN t."cancelledAt" IS NULL AND t."startDate" > ${today} THEN t."startDate" END ASC,
      t."endDate" DESC, t.id ASC
  ), paid AS (
    SELECT "chargeId", SUM("amountPaise") AS amount FROM "Payment"
    WHERE "businessId" = ${businessId} GROUP BY "chargeId"
  ), balances AS (
    SELECT c."memberId", SUM(GREATEST(0, c."amountPaise" - COALESCE(p.amount, 0)))::bigint AS amount
    FROM "Charge" c LEFT JOIN paid p ON p."chargeId" = c.id
    WHERE c."businessId" = ${businessId} AND c."voidedAt" IS NULL GROUP BY c."memberId"
  ), directory AS (
    SELECT m.id, m.code, m.name, m.email, m."createdAt", contact.phone,
      t."planId", t."planName", t."endDate", COALESCE(b.amount, 0)::bigint AS outstanding,
      CASE
        WHEN t."cancelledAt" IS NULL AND t."startDate" <= ${today} AND t."endDate" >= ${today} THEN 'Active'
        WHEN t."cancelledAt" IS NULL AND t."startDate" > ${today} THEN 'Upcoming'
        WHEN t.id IS NOT NULL THEN 'Expired' ELSE 'No plan' END AS status,
      COALESCE(t."cancelledAt" IS NULL AND t."startDate" <= ${today}
        AND t."endDate" BETWEEN ${today} AND ${addDays(today, 7)}, false) AS expiring
    FROM "Member" m
    JOIN "Contact" contact ON contact.id = m."contactId" AND contact."businessId" = m."businessId"
    LEFT JOIN terms t ON t."memberId" = m.id LEFT JOIN balances b ON b."memberId" = m.id
    WHERE m."businessId" = ${businessId} AND NOT m.archived
  )`;
}
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}
// Shared with the member-list report so search and plan filters cannot drift.
export function directoryFilterSql(
  filters: Pick<DirectoryFilters, "q" | "plan"> &
    Partial<Pick<DirectoryFilters, "fees">>,
) {
  const clauses: Prisma.Sql[] = [Prisma.sql`true`];
  if (filters.q) {
    const query = likePattern(filters.q);
    clauses.push(
      Prisma.sql`(name ILIKE ${query} OR code ILIKE ${query} OR phone ILIKE ${query})`,
    );
  }
  if (filters.plan) clauses.push(Prisma.sql`"planId" = ${filters.plan}`);
  if (filters.fees === "unpaid") clauses.push(Prisma.sql`outstanding > 0`);
  if (filters.fees === "settled") clauses.push(Prisma.sql`outstanding = 0`);
  return Prisma.join(clauses, " AND ");
}
const statusSql: Record<MemberStatusFilter, Prisma.Sql> = {
  all: Prisma.sql`true`,
  active: Prisma.sql`status = 'Active'`,
  expiring: Prisma.sql`expiring`,
  expired: Prisma.sql`status = 'Expired'`,
  unpaid: Prisma.sql`outstanding > 0`,
};
const sortSql: Record<keyof typeof memberSorts, Prisma.Sql> = {
  "joined-desc": Prisma.sql`"createdAt" DESC, id ASC`,
  "joined-asc": Prisma.sql`"createdAt" ASC, id ASC`,
  "name-asc": Prisma.sql`LOWER(name) ASC, id ASC`,
  "name-desc": Prisma.sql`LOWER(name) DESC, id ASC`,
  "expiry-asc": Prisma.sql`"endDate" ASC NULLS LAST, id ASC`,
  "expiry-desc": Prisma.sql`"endDate" DESC NULLS LAST, id ASC`,
};
function directoryRows(
  businessId: string,
  filters: DirectoryFilters,
  today: Date,
  limit: number,
  offset: number,
) {
  return db.$queryRaw<
    DirectoryMember[]
  >(Prisma.sql`${directoryBase(businessId, today)}
    SELECT * FROM directory WHERE ${directoryFilterSql(filters)} AND ${statusSql[filters.status]}
    ORDER BY ${sortSql[filters.sort]} LIMIT ${limit} OFFSET ${offset}`);
}
export async function getMemberDirectory(
  ctx: TenantContext,
  filters: DirectoryFilters,
) {
  await assertActive(ctx);
  const today = todayIST();
  const [counts] = await db.$queryRaw<
    DirectoryCounts[]
  >(Prisma.sql`${directoryBase(ctx.businessId, today)}
    SELECT COUNT(*)::int AS "all", COUNT(*) FILTER (WHERE status = 'Active')::int AS active,
      COUNT(*) FILTER (WHERE expiring)::int AS expiring, COUNT(*) FILTER (WHERE status = 'Expired')::int AS expired,
      COUNT(*) FILTER (WHERE outstanding > 0)::int AS unpaid FROM directory WHERE ${directoryFilterSql(filters)}`);
  const total = counts[filters.status],
    pages = Math.max(1, Math.ceil(total / 20)),
    page = Math.min(filters.page, pages);
  const members = await directoryRows(
    ctx.businessId,
    filters,
    today,
    20,
    (page - 1) * 20,
  );
  return { members, counts, total, page, pages };
}
export async function* exportMemberDirectory(
  ctx: TenantContext,
  filters: DirectoryFilters,
) {
  await assertActive(ctx);
  const today = todayIST();
  for (let offset = 0; ; offset += 500) {
    const members = await directoryRows(
      ctx.businessId,
      filters,
      today,
      500,
      offset,
    );
    if (!members.length) return;
    yield members;
  }
}
