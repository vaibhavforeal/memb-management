import { db } from "../db";
import { todayIST } from "../domain";
import { workspaceAccess, type WorkspaceAccess } from "../workspace-access";

export type WorkspaceState = WorkspaceAccess | "SUSPENDED";
export const WORKSPACE_STATES: WorkspaceState[] = [
  "TRIAL",
  "PAID",
  "PAYMENT_DUE",
  "TRIAL_EXPIRED",
  "TRIAL_PENDING",
  "LEGACY",
  "SUSPENDED",
];
export const STATE_LABELS: Record<WorkspaceState, string> = {
  TRIAL: "Trial",
  PAID: "Paid",
  PAYMENT_DUE: "Payment due",
  TRIAL_EXPIRED: "Trial expired",
  TRIAL_PENDING: "Trial not started",
  LEGACY: "Legacy",
  SUSPENDED: "Suspended",
};
export const PAGE_SIZE = 50;

type SummaryRow = {
  status: string;
  monthlyFeePaise: number | null;
  trialRequired: boolean;
  trialEndsAt: Date | null;
  billingPaidThrough: Date | null;
};

/** Suspended workspaces are counted on their own, never in a state bucket. */
export function workspaceState(
  row: SummaryRow,
  now = new Date(),
): WorkspaceState {
  return row.status !== "ACTIVE" ? "SUSPENDED" : workspaceAccess(row, now);
}

export function summarizeWorkspaces(rows: SummaryRow[], now: Date) {
  const byState = Object.fromEntries(
    WORKSPACE_STATES.map((s) => [s, 0]),
  ) as Record<WorkspaceState, number>;
  let mrrPaise = 0;
  for (const row of rows) {
    const state = workspaceState(row, now);
    byState[state] += 1;
    if (state === "PAID") mrrPaise += row.monthlyFeePaise ?? 0;
  }
  return { byState, mrrPaise };
}

/** Start of the current IST calendar month, as a UTC instant. */
function istMonthStart(now: Date) {
  const day = todayIST(now);
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1) - 330 * 60_000,
  );
}

export async function platformOverview(now = new Date()) {
  const day = 86_400_000;
  const [rows, revenue, last7, last30, members, worker, backup] =
    await Promise.all([
      db.business.findMany({
        select: {
          status: true,
          monthlyFeePaise: true,
          trialRequired: true,
          trialEndsAt: true,
          billingPaidThrough: true,
        },
      }),
      db.businessBillingOrder.aggregate({
        _sum: { amountPaise: true },
        where: { paidAt: { gte: istMonthStart(now), lte: now } },
      }),
      db.business.count({
        where: { createdAt: { gte: new Date(+now - 7 * day) } },
      }),
      db.business.count({
        where: { createdAt: { gte: new Date(+now - 30 * day) } },
      }),
      db.member.count(),
      db.workerHeartbeat.findUnique({ where: { id: "worker" } }),
      db.workerHeartbeat.findUnique({ where: { id: "backup" } }),
    ]);
  return {
    total: rows.length,
    ...summarizeWorkspaces(rows, now),
    revenuePaise: revenue._sum.amountPaise ?? 0,
    last7,
    last30,
    members,
    workerUp: !!worker && worker.updatedAt > new Date(+now - 180_000),
    workerDetail: worker?.detail ?? null,
    backupAt: backup?.updatedAt ?? null,
  };
}

export async function listWorkspaces({
  q,
  state,
  page,
}: {
  q?: string;
  state?: string;
  page?: number;
}) {
  const now = new Date();
  const term = q?.trim();
  const rows = await db.business.findMany({
    where: term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { city: { contains: term, mode: "insensitive" } },
            {
              access: {
                some: {
                  role: "OWNER",
                  user: { email: { contains: term, mode: "insensitive" } },
                },
              },
            },
          ],
        }
      : undefined,
    include: {
      _count: { select: { members: true } },
      access: {
        where: { role: "OWNER" },
        select: { user: { select: { email: true } } },
      },
      invitations: {
        where: { acceptedAt: null, role: "OWNER" },
        select: { email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const wanted = WORKSPACE_STATES.find((s) => s === state);
  const all = rows
    .map((b) => ({ ...b, state: workspaceState(b, now) }))
    .filter((b) => !wanted || b.state === wanted);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page ?? 1) || 1), pages);
  return {
    total: all.length,
    pages,
    page: current,
    items: all.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
  };
}

export async function workspaceDetail(id: string) {
  const business = await db.business.findUnique({
    where: { id },
    include: {
      _count: { select: { members: true } },
      access: {
        select: {
          id: true,
          role: true,
          user: {
            select: { id: true, name: true, email: true, createdAt: true },
          },
        },
        orderBy: { role: "asc" },
      },
      invitations: {
        where: { acceptedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      },
      billingOrders: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!business) return null;
  const [grants, audit] = await Promise.all([
    db.supportGrant.findMany({
      where: { businessId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.auditLog.findMany({
      where: { businessId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const actorIds = [
    ...new Set([
      ...grants.map((g) => g.actorId),
      ...audit.map((a) => a.actorId),
    ]),
  ];
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, email: true },
  });
  const emailOf = new Map(actors.map((u) => [u.id, u.email]));
  return {
    business,
    state: workspaceState(business),
    grants: grants.map((g) => ({
      ...g,
      actorEmail: emailOf.get(g.actorId) ?? g.actorId,
    })),
    audit: audit.map((a) => ({
      ...a,
      actorEmail: emailOf.get(a.actorId) ?? a.actorId,
    })),
  };
}

const IST_OFFSET_MS = 330 * 60_000;

function validDay(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(+date) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

/** [start, end) UTC instants of an IST calendar month given as YYYY-MM. */
export function istMonthRange(month: string | undefined) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const first = validDay(`${month}-01`);
  if (!first) return null;
  const next = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1),
  );
  return {
    start: new Date(+first - IST_OFFSET_MS),
    end: new Date(+next - IST_OFFSET_MS),
  };
}

/** Inclusive IST date range (YYYY-MM-DD) as [from, to) UTC instants. */
export function istDayRange(from?: string, to?: string) {
  const a = validDay(from);
  const b = validDay(to);
  return {
    gte: a ? new Date(+a - IST_OFFSET_MS) : undefined,
    lt: b ? new Date(+b + 86_400_000 - IST_OFFSET_MS) : undefined,
  };
}

function pageOf(page: number | undefined, pages: number) {
  return Math.min(Math.max(1, Math.floor(page ?? 1) || 1), pages);
}

export type OrderFilters = { status?: string; month?: string; q?: string };

/** Which order date the month filter applies to: payment date for paid orders, else creation date. */
export function orderMonthField(status?: string): "paidAt" | "createdAt" {
  return status === "paid" ? "paidAt" : "createdAt";
}

export function orderWhere({ status, month, q }: OrderFilters) {
  const range = istMonthRange(month);
  const term = q?.trim();
  // With status=paid the month matches the 12-month totals, which group by paidAt.
  const monthField = orderMonthField(status);
  return {
    ...(status === "paid" ? { paidAt: { not: null } } : {}),
    ...(status === "pending" ? { paidAt: null } : {}),
    ...(range
      ? monthField === "paidAt"
        ? { paidAt: { not: null, gte: range.start, lt: range.end } }
        : { createdAt: { gte: range.start, lt: range.end } }
      : {}),
    ...(term
      ? { business: { name: { contains: term, mode: "insensitive" as const } } }
      : {}),
  };
}

export async function listOrders({
  page,
  ...filters
}: OrderFilters & { page?: number }) {
  const where = orderWhere(filters);
  const total = await db.businessBillingOrder.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = pageOf(page, pages);
  const items = await db.businessBillingOrder.findMany({
    where,
    include: { business: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return { total, pages, page: current, items };
}

export const CSV_ROW_CAP = 10_000;

export async function exportOrders(filters: OrderFilters) {
  const rows = await db.businessBillingOrder.findMany({
    where: orderWhere(filters),
    include: { business: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: CSV_ROW_CAP,
  });
  return rows.map((r) => ({ ...r, workspace: r.business.name }));
}

/** The last 12 IST month keys (YYYY-MM), newest first. */
export function lastTwelveMonthKeys(now = new Date()) {
  const today = todayIST(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  return Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(year, month - i, 1)).toISOString().slice(0, 7),
  );
}

/** Groups paid orders into the given IST month keys; orders outside them are ignored. */
export function groupRevenueByMonth(
  keys: string[],
  paid: { amountPaise: number; paidAt: Date | null }[],
) {
  const totals = new Map(keys.map((k) => [k, { paise: 0, orders: 0 }]));
  for (const o of paid) {
    if (!o.paidAt) continue;
    const key = new Date(+o.paidAt + IST_OFFSET_MS).toISOString().slice(0, 7);
    const t = totals.get(key);
    if (t) {
      t.paise += o.amountPaise;
      t.orders += 1;
    }
  }
  return keys.map((month) => ({ month, ...totals.get(month)! }));
}

/** Paid totals for the last 12 IST months (by payment date), newest first. */
export async function monthlyRevenue(now = new Date()) {
  const keys = lastTwelveMonthKeys(now);
  const oldest = istMonthRange(keys[11])!.start;
  const paid = await db.businessBillingOrder.findMany({
    where: { paidAt: { gte: oldest } },
    select: { amountPaise: true, paidAt: true },
  });
  return groupRevenueByMonth(keys, paid);
}

export async function listUsers({ q, page }: { q?: string; page?: number }) {
  const term = q?.trim();
  const where = term
    ? {
        OR: [
          { email: { contains: term, mode: "insensitive" as const } },
          { name: { contains: term, mode: "insensitive" as const } },
        ],
      }
    : {};
  const total = await db.user.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = pageOf(page, pages);
  const items = await db.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      platformAdmin: true,
      createdAt: true,
      _count: { select: { access: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return { total, pages, page: current, items };
}

export async function userDetail(id: string, now = new Date()) {
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      platformAdmin: true,
      createdAt: true,
      access: {
        select: {
          id: true,
          role: true,
          business: { select: { id: true, name: true } },
        },
      },
      sessions: {
        where: { expiresAt: { gt: now } },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          ipAddress: true,
          userAgent: true,
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

export type AuditFilters = {
  business?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
};

export async function listAudit({
  page,
  ...f
}: AuditFilters & { page?: number }) {
  const actor = f.actor?.trim();
  const range = istDayRange(f.from, f.to);
  const where = {
    ...(f.business ? { businessId: f.business } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(actor
      ? {
          actorId: {
            in: (
              await db.user.findMany({
                where: { email: { contains: actor, mode: "insensitive" } },
                select: { id: true },
              })
            ).map((u) => u.id),
          },
        }
      : {}),
    ...(range.gte || range.lt
      ? { createdAt: { gte: range.gte, lt: range.lt } }
      : {}),
  };
  const total = await db.auditLog.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = pageOf(page, pages);
  const rows = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const [users, businesses] = await Promise.all([
    db.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.actorId))] } },
      select: { id: true, email: true },
    }),
    db.business.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              rows.flatMap((r) => (r.businessId ? [r.businessId] : [])),
            ),
          ],
        },
      },
      select: { id: true, name: true },
    }),
  ]);
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  const nameOf = new Map(businesses.map((b) => [b.id, b.name]));
  return {
    total,
    pages,
    page: current,
    items: rows.map((r) => ({
      ...r,
      actorEmail: emailOf.get(r.actorId) ?? r.actorId,
      businessName: r.businessId
        ? (nameOf.get(r.businessId) ?? r.businessId)
        : null,
    })),
  };
}

export async function auditActions() {
  const rows = await db.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
}
