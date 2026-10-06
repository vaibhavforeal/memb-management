import "dotenv/config";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../src/lib/db";
import { todayIST, addDays } from "../src/lib/domain";
import { dashboard } from "../src/lib/reporting";
import { memberFilter } from "../src/lib/services";
import {
  getMemberDirectory,
  parseDirectoryFilters,
} from "../src/lib/member-directory";
import { fixture, cleanup, ensureLocalTest } from "./test-support";
async function main() {
  ensureLocalTest();
  const f = await fixture("loadtest");
  const { ctx } = f;
  const today = todayIST();
  const results: Record<string, number> = { members: 10000 };
  try {
    const plan = await db.plan.create({
      data: {
        businessId: ctx.businessId,
        name: "Load plan",
        months: 1,
        amountPaise: 250000,
      },
    });
    const begin = performance.now();
    for (let offset = 0; offset < 10000; offset += 1000) {
      const rows = Array.from({ length: 1000 }, (_, i) => offset + i);
      const id = (kind: string, i: number) => `${f.b.id}-${kind}-${i}`;
      await db.contact.createMany({
        data: rows.map((i) => ({
          id: id("contact", i),
          businessId: ctx.businessId,
          phone: "+9195" + String(i).padStart(8, "0"),
        })),
      });
      await db.member.createMany({
        data: rows.map((i) => ({
          id: id("member", i),
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          contactId: id("contact", i),
          code: `LOAD-${i}`,
          name: `Load Member ${String(i).padStart(5, "0")}`,
        })),
      });
      await db.membership.createMany({
        data: rows.map((i) => ({
          id: id("term", i),
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          memberId: id("member", i),
          planId: plan.id,
          planName: plan.name,
          startDate: today,
          endDate: addDays(today, 29),
        })),
      });
      await db.charge.createMany({
        data: rows.map((i) => ({
          id: id("charge", i),
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          memberId: id("member", i),
          membershipId: id("term", i),
          description: plan.name,
          amountPaise: 250000,
          dueDate: today,
        })),
      });
      await db.payment.createMany({
        data: rows.map((i) => ({
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          chargeId: id("charge", i),
          amountPaise: 100000,
          method: "UPI",
          recordedBy: ctx.userId,
          idempotencyKey: id("payment", i),
        })),
      });
    }
    results.fixtureMs = Math.round(performance.now() - begin);
    const start = performance.now();
    const data = await dashboard(ctx);
    results.dashboardMs = Math.round(performance.now() - start);
    assert.equal(data.active, 10000);
    assert.equal(data.outstanding, 1500000000);
    const searchStart = performance.now();
    const members = await db.member.findMany({
      where: memberFilter(ctx.businessId, "Load Member 099", "active"),
      take: 20,
      include: {
        contact: true,
        memberships: true,
        charges: { include: { payments: true } },
      },
    });
    results.searchMs = Math.round(performance.now() - searchStart);
    assert.equal(members.length, 20);
    const directoryStart = performance.now();
    const directory = await getMemberDirectory(
      ctx,
      parseDirectoryFilters({
        status: "unpaid",
        sort: "expiry-asc",
        plan: plan.id,
      }),
    );
    results.filteredDirectoryMs = Math.round(
      performance.now() - directoryStart,
    );
    assert.equal(directory.total, 10000);
    assert.equal(directory.counts.active, 10000);
    assert.equal(directory.members.length, 20);
    assert.equal(directory.members[0].outstanding, 150000n);
    const template = await db.messageTemplate.create({
      data: {
        businessId: ctx.businessId,
        name: "load-template",
        category: "UTILITY",
        status: "APPROVED",
        body: "hello",
        parameterKeys: [],
      },
    });
    const queueStart = performance.now();
    for (let offset = 0; offset < 10000; offset += 1000)
      await db.message.createMany({
        data: Array.from({ length: 1000 }, (_, i) => ({
          businessId: ctx.businessId,
          memberId: `${f.b.id}-member-${offset + i}`,
          templateId: template.id,
          kind: "ANNOUNCEMENT",
          phone: "+9195" + String(offset + i).padStart(8, "0"),
          status: "SUPPRESSED",
          lastError: "Load fixture; never send",
          scheduledAt: new Date(),
          idempotencyKey: `load-message-${f.b.id}-${offset + i}`,
        })),
      });
    results.queue10000Ms = Math.round(performance.now() - queueStart);
    assert.equal(
      await db.message.count({ where: { businessId: ctx.businessId } }),
      10000,
    );
    mkdirSync("artifacts", { recursive: true });
    writeFileSync("artifacts/load-test.json", JSON.stringify(results, null, 2));
    console.info(JSON.stringify(results, null, 2));
    const limits = {
      dashboardMs: 3000,
      searchMs: 1000,
      filteredDirectoryMs: 3000,
    };
    const slow = Object.entries(limits)
      .filter(([key, limit]) => results[key] >= limit)
      .map(
        ([key, limit]) => `${key}: ${results[key]} ms (target < ${limit} ms)`,
      );
    assert.equal(
      slow.length,
      0,
      `Local 10k performance targets missed: ${slow.join(", ")}`,
    );
  } finally {
    await cleanup(f.b.id);
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
