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
