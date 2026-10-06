import { Prisma } from "@prisma/client";
import { db } from "./db";
import { addDays, atHourIST, todayIST } from "./domain";
import { assertActive, type TenantContext } from "./context";
export async function dashboard(ctx: TenantContext) {
  await assertActive(ctx);
  const today = todayIST(),
    monthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
  const [
    total,
    active,
    expiring,
    checkins,
    collections,
    outstanding,
    trend,
    recentPayments,
    renewals,
  ] = await Promise.all([
    db.member.count({ where: { businessId: ctx.businessId, archived: false } }),
    db.member.count({
      where: {
        businessId: ctx.businessId,
        archived: false,
        memberships: {
          some: {
            cancelledAt: null,
            startDate: { lte: today },
            endDate: { gte: today },
          },
        },
      },
    }),
    db.membership.count({
      where: {
        businessId: ctx.businessId,
        cancelledAt: null,
        startDate: { lte: today },
        endDate: { gte: today, lte: addDays(today, 7) },
      },
    }),
    db.checkin.count({ where: { businessId: ctx.businessId, day: today } }),
    db.payment.aggregate({
      where: {
        businessId: ctx.businessId,
        createdAt: { gte: atHourIST(monthStart, 0) },
      },
      _sum: { amountPaise: true },
    }),
    db.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COALESCE(SUM(GREATEST(0, c."amountPaise" - COALESCE(p.paid, 0))),0)::bigint AS total FROM "Charge" c LEFT JOIN (SELECT "chargeId", SUM("amountPaise") paid FROM "Payment" WHERE "businessId"=${ctx.businessId} GROUP BY "chargeId") p ON p."chargeId"=c.id WHERE c."businessId"=${ctx.businessId} AND c."voidedAt" IS NULL`,
    ),
    db.$queryRaw<{ month: string; total: bigint }[]>(
      Prisma.sql`SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month, SUM("amountPaise")::bigint AS total FROM "Payment" WHERE "businessId"=${ctx.businessId} AND "createdAt">=${addDays(today, -185)} GROUP BY month ORDER BY month`,
    ),
    db.payment.findMany({
      where: { businessId: ctx.businessId },
      include: { charge: { include: { member: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.membership.findMany({
      where: {
        businessId: ctx.businessId,
        cancelledAt: null,
        startDate: { lte: today },
        endDate: { gte: today, lte: addDays(today, 7) },
      },
      include: { member: { include: { contact: true } } },
      orderBy: { endDate: "asc" },
      take: 5,
    }),
  ]);
  const chart = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5 + i, 1),
    );
    const key = d.toISOString().slice(0, 7);
    return {
      month: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }),
      total: Number(trend.find((t) => t.month === key)?.total ?? 0) / 100,
    };
  });
  return {
    total,
    active,
    expiring,
    checkins,
    collections: collections._sum.amountPaise ?? 0,
    outstanding: Number(outstanding[0]?.total ?? 0),
    chart,
    recentPayments,
    renewals,
  };
}
