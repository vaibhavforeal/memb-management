import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { addDays, todayIST } from "../src/lib/domain";
import { saveMember, recordPayment, reversePayment } from "../src/lib/services";
import {
  directoryQuery,
  exportMemberDirectory,
  getMemberDirectory,
  parseDirectoryFilters,
} from "../src/lib/member-directory";
import { cleanup, ensureLocalTest, fixture } from "./test-support";

async function main() {
  ensureLocalTest();
  const first = await fixture("itest"),
    second = await fixture("itest");
  const { ctx } = first,
    today = todayIST();
  const list = (params: Record<string, string> = {}) =>
    getMemberDirectory(ctx, parseDirectoryFilters(params));
  try {
    const plan = await db.plan.create({
      data: {
        businessId: ctx.businessId,
        name: "Standard",
        months: 1,
        amountPaise: 250000,
      },
    });
    const nextPlan = await db.plan.create({
      data: {
        businessId: ctx.businessId,
        name: "Next plan",
        months: 1,
        amountPaise: 300000,
      },
    });
    const otherPlan = await db.plan.create({
      data: {
        businessId: second.ctx.businessId,
        name: "Private plan",
        months: 1,
        amountPaise: 250000,
      },
    });
    let n = 0;
    async function member(
      name: string,
      end?: number,
      options: {
        future?: boolean;
        cancel?: boolean;
        planId?: string;
        charge?: boolean;
        waived?: boolean;
      } = {},
    ) {
      const m = await saveMember(ctx, {
        name,
        phone: "+91970000" + String(++n).padStart(4, "0"),
      });
      await db.member.update({
        where: { id: m.id },
        data: { createdAt: addDays(today, -n) },
      });
      if (end === undefined) return { m, term: null, charge: null };
      const term = await db.membership.create({
        data: {
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          memberId: m.id,
          planId: options.planId ?? plan.id,
          planName: options.planId ? nextPlan.name : plan.name,
          startDate: addDays(today, options.future ? 2 : -10),
          endDate: addDays(today, end),
          cancelledAt: options.cancel ? new Date() : null,
        },
      });
      const charge = options.charge
        ? await db.charge.create({
            data: {
              businessId: ctx.businessId,
              branchId: ctx.branchId,
              memberId: m.id,
              membershipId: term.id,
              description: plan.name,
              amountPaise: 250000,
              dueDate: today,
              voidedAt: options.waived ? new Date() : null,
            },
          })
        : null;
      return { m, term, charge };
    }
    const alice = await member("Alice", 20, { charge: true });
    const dueToday = await member("Today", 0, { charge: true });
    await member("Seven", 7, { charge: true });
    await member("Eight", 8, { charge: true, waived: true });
    await member("Expired", -1, { charge: true });
    await member("Upcoming", 30, { future: true, planId: nextPlan.id });
    await member("Cancelled", 10, { cancel: true });
    const plain = await member("Plain_% Person");
    const archived = await member("Archived", 15);
    await db.member.update({
      where: { id: archived.m.id },
      data: { archived: true },
    });
    const renewed = await member("Renewed", 5);
    await db.membership.create({
      data: {
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        memberId: renewed.m.id,
        planId: nextPlan.id,
        planName: nextPlan.name,
        startDate: addDays(today, 6),
        endDate: addDays(today, 35),
      },
    });
    const partial = await recordPayment(ctx, {
      chargeId: alice.charge!.id,
      amountPaise: 100000,
      method: "UPI",
      reference: "fixture",
      idempotencyKey: randomUUID(),
    });
    await recordPayment(ctx, {
      chargeId: dueToday.charge!.id,
      amountPaise: 250000,
      method: "CASH",
      reference: "fixture",
      idempotencyKey: randomUUID(),
    });
    await saveMember(second.ctx, {
      name: "Alice private",
      phone: "9876543210",
    });

    const result = await list();
    assert.deepEqual(result.counts, {
      all: 9,
      active: 5,
      expiring: 3,
      expired: 2,
      unpaid: 3,
    });
    assert.equal(
      result.members.find((m) => m.id === alice.m.id)?.outstanding,
      150000n,
    );
    assert.equal(
      result.members.find((m) => m.id === renewed.m.id)?.planId,
      plan.id,
    );
    assert.equal(
      result.members.find((m) => m.id === plain.m.id)?.status,
      "No plan",
    );
    assert.deepEqual(
      (await list({ status: "expiring" })).members.map((m) => m.name).sort(),
      ["Renewed", "Seven", "Today"],
    );
    assert.deepEqual(
      (await list({ status: "expired", fees: "unpaid" })).members.map(
        (m) => m.name,
      ),
      ["Expired"],
    );
    assert.deepEqual(
      (await list({ plan: nextPlan.id })).members.map((m) => m.name),
      ["Upcoming"],
    );
    assert.equal((await list({ plan: otherPlan.id })).total, 0);
    assert.equal((await list({ q: "Alice" })).total, 1);
    assert.equal(
      (await getMemberDirectory(second.ctx, parseDirectoryFilters({}))).total,
      1,
    );
    assert.equal((await list({ q: "%" })).members[0]?.id, plain.m.id);
    assert.equal((await list({ q: "%" })).total, 1);
    assert.equal((await list({ q: "' OR true --" })).total, 0);
    const expiryAsc = (await list({ sort: "expiry-asc" })).members;
    assert.equal(expiryAsc[0].name, "Expired");
    assert.equal(expiryAsc.at(-1)?.name, "Plain_% Person");
    assert.equal(
      (await list({ sort: "expiry-desc" })).members.at(-1)?.name,
      "Plain_% Person",
    );
    assert.equal(
      (await list({ sort: "joined-desc" })).members[0].name,
      "Alice",
    );
    assert.equal(
      (await list({ sort: "joined-asc" })).members[0].name,
      "Renewed",
    );
    assert.equal((await list({ sort: "name-asc" })).members[0].name, "Alice");
    assert.equal(
      (await list({ sort: "name-desc" })).members[0].name,
      "Upcoming",
    );
    console.info(
      "PASS counts, expiry boundaries, active/future terms, filters, literal search and sorting",
    );

    await reversePayment(ctx, partial.id, "Directory fixture reversal");
    assert.equal((await list({ q: "Alice" })).members[0].outstanding, 250000n);
    await recordPayment(ctx, {
      chargeId: alice.charge!.id,
      amountPaise: 250000,
      method: "BANK",
      reference: "fixture",
      idempotencyKey: randomUUID(),
    });
    assert.equal((await list({ q: "Alice", status: "unpaid" })).total, 0);
    assert.equal((await list({ fees: "settled", q: "Eight" })).total, 1);
    console.info(
      "PASS partial payments, reversals, settlement and waived charges",
    );

    for (let i = 0; i < 25; i++)
      await member(`Bulk ${String(i).padStart(2, "0")}`);
    const firstPage = await list({ q: "Bulk", sort: "name-asc" });
    const secondPage = await list({ q: "Bulk", sort: "name-asc", page: "2" });
    assert.equal(firstPage.total, 25);
    assert.equal(firstPage.members.length, 20);
    assert.equal(secondPage.members.length, 5);
    assert.equal(
      new Set([...firstPage.members, ...secondPage.members].map((m) => m.id))
        .size,
      25,
    );
    assert.equal((await list({ q: "Bulk", page: "999" })).page, 2);
    let exported = 0;
    for await (const batch of exportMemberDirectory(
      ctx,
      parseDirectoryFilters({ q: "Bulk" }),
    )) {
      exported += batch.length;
      assert(batch.every((m) => m.name.startsWith("Bulk")));
    }
    assert.equal(exported, 25);
    assert.equal(
      parseDirectoryFilters({
        sort: "__proto__",
        page: "Infinity",
        q: ["a", "b"],
      }).sort,
      "joined-desc",
    );
    assert.equal(parseDirectoryFilters({ page: "2.5" }).page, 1);
    assert.equal(
      directoryQuery(
        parseDirectoryFilters({
          q: "Bulk",
          status: "unpaid",
          fees: "unpaid",
          plan: plan.id,
          sort: "name-asc",
          page: "2",
        }),
      ).includes("page=2"),
      true,
    );
    console.info(
      "PASS pagination, filtered export and malformed query parameters",
    );
    await db.business.update({
      where: { id: first.b.id },
      data: { status: "SUSPENDED" },
    });
    await assert.rejects(() => list(), /not active/);
    console.info("PASS business isolation and suspension");
  } finally {
    await cleanup(first.b.id);
    await cleanup(second.b.id);
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
