import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { addDays, dayString, todayIST } from "../src/lib/domain";
import {
  parseReportFilters,
  type ReportParams,
} from "../src/lib/report-filters";
import { exportReport, getReport } from "../src/lib/reports";
import { saveMember } from "../src/lib/services";
import { cleanup, ensureLocalTest, fixture } from "./test-support";

async function main() {
  ensureLocalTest();
  const a = await fixture("itest"),
    b = await fixture("itest"),
    today = todayIST();
  const run = (params: ReportParams = {}) =>
    getReport(a.ctx, parseReportFilters(params));
  const metric = (r: Awaited<ReturnType<typeof getReport>>, label: string) =>
    r.metrics.find((m) => m.label === label)!.value;
  try {
    const plan = await db.plan.create({
      data: {
        businessId: a.b.id,
        name: "Report plan",
        months: 1,
        amountPaise: 1000000,
      },
    });
    let index = 0;
    async function member(
      name: string,
      dueOffset: number,
      options: {
        archived?: boolean;
        cancelled?: boolean;
        voided?: boolean;
      } = {},
    ) {
      const m = await saveMember(a.ctx, {
        name,
        phone: `+91987654${String(++index).padStart(4, "0")}`,
      });
      if (options.archived)
        await db.member.update({
          where: { id: m.id },
          data: { archived: true },
        });
      const term = await db.membership.create({
        data: {
          businessId: a.b.id,
          branchId: a.ctx.branchId,
          memberId: m.id,
          planId: plan.id,
          planName: plan.name,
          startDate: addDays(today, -15),
          endDate: addDays(today, 7),
          cancelledAt: options.cancelled ? new Date() : null,
        },
      });
      const charge = await db.charge.create({
        data: {
          businessId: a.b.id,
          branchId: a.ctx.branchId,
          memberId: m.id,
          membershipId: term.id,
          description: plan.name,
          amountPaise: 1000000,
          dueDate: addDays(today, dueOffset),
          voidedAt: options.voided ? new Date() : null,
        },
      });
      return { m, term, charge };
    }
    const alice = await member("Alice Reports", -31);
    const archived = await member("Archived Reports", -100, {
      archived: true,
      cancelled: true,
    });
    await member("Waived Reports", -10, { voided: true });
    await member("Due Today Reports", 0);
    await member("Future Reports", 5);
    await saveMember(b.ctx, {
      name: "Other tenant secret",
      phone: "9876543210",
    });
    for (const [createdAt, amountPaise, method] of [
      ["2026-08-31T18:29:59.999Z", 10000, "CASH"],
      ["2026-08-31T18:30:00.000Z", 20000, "UPI"],
      ["2026-09-30T18:29:59.999Z", 30000, "CASH"],
      ["2026-09-30T18:30:00.000Z", 40000, "UPI"],
      ["2026-09-15T12:00:00.000Z", -10000, "CASH"],
    ] as const)
      await db.payment.create({
        data: {
          businessId: a.b.id,
          branchId: a.ctx.branchId,
          chargeId: alice.charge.id,
          amountPaise,
          method,
          createdAt: new Date(createdAt),
          recordedBy: a.user.id,
          idempotencyKey: randomUUID(),
        },
      });
    const range = {
      type: "collections",
      period: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
    };
    const monthly = await run(range);
    assert.equal(monthly.total, 1);
    assert.equal(metric(monthly, "Received"), 50000);
    assert.equal(metric(monthly, "Reversed"), 10000);
    assert.equal(metric(monthly, "Net collections"), 40000);
    assert.equal(metric(monthly, "Ledger entries"), 3);
    assert.equal(
      metric(await run({ ...range, group: "week" }), "Net collections"),
      40000,
    );
    const daily = await run({ ...range, group: "day", page: "2" });
    assert.equal(daily.total, 30);
    assert.equal(daily.rows.length, 5);
    assert.equal(metric(daily, "Net collections"), 40000);
    assert.equal(
      metric(await run({ ...range, method: "UPI" }), "Net collections"),
      20000,
    );
    assert.equal(
      metric(await run({ ...range, q: "does not exist" }), "Net collections"),
      0,
    );
    assert.equal(
      metric(
        await run({ ...range, from: "2026-09-15", to: "2026-09-15" }),
        "Net collections",
      ),
      -10000,
    );
    const dues = await run({ type: "outstanding" });
    assert.equal(dues.total, 4);
    assert.equal(metric(dues, "Outstanding"), 3910000);
    assert.equal(metric(dues, "Overdue"), 1910000);
    assert.equal(metric(dues, "Over 90 days"), 1000000);
    assert.equal(
      (await run({ type: "outstanding", dues: "current" })).total,
      2,
    );
    assert.equal(
      (await run({ type: "outstanding", dues: "overdue" })).total,
      2,
    );
    assert.equal(
      dues.rows.find((r) => r.memberId === archived.m.id)?.memberState,
      "Archived",
    );
    assert.equal(
      dues.rows.find((r) => r.memberId === alice.m.id)?.ageing,
      "31–60 days",
    );
    const nextPlan = await db.plan.create({
      data: {
        businessId: a.b.id,
        name: "Future plan",
        months: 1,
        amountPaise: 1000000,
      },
    });
    await db.membership.create({
      data: {
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        memberId: alice.m.id,
        planId: nextPlan.id,
        planName: nextPlan.name,
        startDate: addDays(today, 8),
        endDate: addDays(today, 38),
      },
    });
    assert.equal(
      (await run({ type: "members", q: "Alice" })).rows[0].planName,
      "Report plan",
    );
    assert.equal((await run({ type: "members", plan: nextPlan.id })).total, 0);
    assert.equal(
      (await run({ type: "renewals", q: "Alice", renewal: "booked" })).total,
      1,
    );
    assert.equal(
      (await run({ type: "renewals", q: "Alice", renewal: "needed" })).total,
      0,
    );
    assert.equal((await run({ type: "renewals", q: "Archived" })).total, 0);
    await db.checkin.createMany({
      data: [0, -1, -8].map((offset) => ({
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        memberId: alice.m.id,
        day: addDays(today, offset),
        recordedBy: a.user.id,
      })),
    });
    const attendance = await run({
      type: "attendance",
      period: "custom",
      from: dayString(addDays(today, -1)),
      to: dayString(today),
    });
    assert.equal(metric(attendance, "Total check-ins"), 2);
    assert.equal(attendance.total, 1);
    await db.member.createMany({
      data: Array.from({ length: 510 }, (_, i) => ({
        id: randomUUID(),
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        contactId: alice.m.contactId,
        code: `RPT-${i}`,
        name:
          i === 0
            ? '=HYPERLINK("x")'
            : `Bulk report ${String(i).padStart(3, "0")}`,
      })),
    });
    assert.equal((await run()).total, 514);
    const last = await run({ page: "99999" });
    assert.equal(last.page, last.pages);
    assert.equal(last.rows.length, 14);
    assert.equal((await run({ q: "%" })).total, 0);
    assert.equal((await run({ q: "' OR 1=1 --" })).total, 0);
    let csv = "";
    for await (const chunk of exportReport(
      a.ctx,
      parseReportFilters({ page: "99" }),
    ))
      csv += chunk;
    assert.equal(csv.trim().split("\r\n").length, 515);
    assert(csv.includes("' =HYPERLINK".replace(" ", "")));
    assert(!csv.includes("Other tenant secret"));
    assert(!csv.includes("Archived Reports"));
    await assert.rejects(
      getReport({ ...a.ctx, userId: b.user.id }, parseReportFilters({})),
      /access has changed/,
    );
    await assert.rejects(
      exportReport({ ...a.ctx, role: "STAFF" }, parseReportFilters({})).next(),
      /owner/,
    );
    await db.business.update({
      where: { id: a.b.id },
      data: { trialRequired: true, trialEndsAt: addDays(today, -1) },
    });
    await assert.rejects(run(), /plan|trial|expired/i);
    console.info(
      "Reports integration passed: IST boundaries, weekly/monthly totals, reversals, ageing, renewals, attendance, 500-row export batching, access and tenant isolation.",
    );
  } finally {
    await cleanup(a.b.id);
    await cleanup(b.b.id);
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
