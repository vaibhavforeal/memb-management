import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { addDays, balance, dayString, todayIST } from "../src/lib/domain";
import {
  createMembership,
  recordPayment,
  reversePayment,
  saveMember,
  savePlan,
  waiveCharge,
} from "../src/lib/services";
import { cleanup, ensureLocalTest, fixture } from "./test-support";

async function main() {
  ensureLocalTest();
  const a = await fixture("itest"),
    b = await fixture("itest");
  try {
    const member = await saveMember(a.ctx, {
      name: "Billing test member",
      phone: "9876543210",
    });
    const planInput = {
      name: "Taxed plan",
      months: "1",
      amount: "1000",
      admissionFee: "500",
      taxRate: "18",
      taxMode: "EXCLUSIVE",
    };
    const plan = await savePlan(a.ctx, planInput);
    await assert.rejects(
      () => savePlan({ ...a.ctx, role: "STAFF" }, planInput),
      /owner/,
    );
    await assert.rejects(() => savePlan(b.ctx, { ...planInput, id: plan.id }));
    await assert.rejects(
      () => savePlan(a.ctx, { ...planInput, taxRate: "100.01" }),
      /percentage/,
    );
    const input = {
      memberId: member.id,
      planId: plan.id,
      startDate: dayString(todayIST()),
      dueDate: dayString(todayIST()),
      discountType: "PERCENT",
      discountValue: "10",
      discountReason: "Joining offer",
    };
    await assert.rejects(() => createMembership(b.ctx, input), /not found/);
    await assert.rejects(
      () => createMembership(a.ctx, { ...input, expectedAmountPaise: 1 }),
      /fee has changed/,
    );
    await assert.rejects(
      () => createMembership(a.ctx, { ...input, discountReason: "" }),
      /reason/,
    );
    await assert.rejects(
      () => createMembership(a.ctx, { ...input, discountValue: "101" }),
      /percentage/,
    );
    assert.equal(
      await db.membership.count({ where: { memberId: member.id } }),
      0,
    );
    const term = await createMembership(a.ctx, {
      ...input,
      expectedAmountPaise: 159300,
    });
    const charge = await db.charge.findUniqueOrThrow({
      where: { membershipId: term.id },
    });
    assert.equal(charge.amountPaise, 159300);
    assert.equal(charge.admissionFeePaise, 50000);
    assert.equal(charge.taxPaise, 24300);
    assert.equal(charge.discountPaise, 15000);
    assert.equal(charge.discountReason, "Joining offer");
    console.info(
      "PASS plan permissions, validation, server total and stored breakdown",
    );

    await savePlan(a.ctx, {
      ...planInput,
      id: plan.id,
      amount: "1180",
      taxMode: "INCLUSIVE",
    });
    assert.deepEqual(
      await db.charge.findUniqueOrThrow({ where: { id: charge.id } }),
      charge,
    );
    const renewal = {
      ...input,
      startDate: dayString(addDays(term.endDate, 1)),
      discountType: "NONE",
      discountValue: "0",
    };
    await assert.rejects(
      () => createMembership(a.ctx, { ...renewal, includeAdmissionFee: true }),
      /first membership/,
    );
    const next = await createMembership(a.ctx, renewal);
    const nextCharge = await db.charge.findUniqueOrThrow({
      where: { membershipId: next.id },
    });
    assert.equal(nextCharge.admissionFeePaise, 0);
    assert.equal(nextCharge.taxPaise, 18000);
    assert.equal(nextCharge.amountPaise, 118000);
    console.info(
      "PASS immutable history, tax-inclusive renewals and no repeat admission",
    );

    const paymentInput = {
      chargeId: charge.id,
      amountPaise: 100000,
      method: "UPI",
      reference: "Test",
      idempotencyKey: randomUUID(),
    };
    const payment = await recordPayment(a.ctx, paymentInput);
    assert.equal((await recordPayment(a.ctx, paymentInput)).id, payment.id);
    const paidCharge = await db.charge.findUniqueOrThrow({
      where: { id: charge.id },
      include: { payments: true },
    });
    assert.equal(balance(paidCharge), 59300);
    await assert.rejects(
      () =>
        recordPayment(a.ctx, {
          ...paymentInput,
          idempotencyKey: randomUUID(),
          amountPaise: 59301,
        }),
      /exceeds/,
    );
    await reversePayment(a.ctx, payment.id, "Test correction");
    await waiveCharge(a.ctx, charge.id, "Test waiver");
    assert.equal(
      balance(
        await db.charge.findUniqueOrThrow({
          where: { id: charge.id },
          include: { payments: true },
        }),
      ),
      0,
    );
    console.info(
      "PASS partial payments, idempotency, overpayment rejection, reversal and waiver",
    );

    const skipped = await saveMember(a.ctx, {
      name: "No admission",
      phone: "9876543211",
    });
    const skippedTerm = await createMembership(a.ctx, {
      ...input,
      memberId: skipped.id,
      includeAdmissionFee: false,
      discountType: "NONE",
      discountValue: "0",
    });
    assert.equal(
      (
        await db.charge.findUniqueOrThrow({
          where: { membershipId: skippedTerm.id },
        })
      ).admissionFeePaise,
      0,
    );
    const free = await saveMember(a.ctx, {
      name: "Full discount",
      phone: "9876543212",
    });
    const freeTerm = await createMembership(a.ctx, {
      ...input,
      memberId: free.id,
      discountValue: "100",
    });
    assert.equal(
      (
        await db.charge.findUniqueOrThrow({
          where: { membershipId: freeTerm.id },
        })
      ).amountPaise,
      0,
    );

    const concurrent = await saveMember(a.ctx, {
      name: "Concurrent admission",
      phone: "9876543213",
    });
    const concurrentInput = {
      ...input,
      memberId: concurrent.id,
      includeAdmissionFee: true,
    };
    const attempts = await Promise.allSettled([
      createMembership(a.ctx, concurrentInput),
      createMembership(a.ctx, {
        ...concurrentInput,
        startDate: dayString(addDays(todayIST(), 40)),
      }),
    ]);
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      await db.charge.count({
        where: { memberId: concurrent.id, admissionFeePaise: { gt: 0 } },
      }),
      1,
    );
    console.info(
      "PASS optional admission, free memberships and concurrent admission protection",
    );
  } finally {
    await cleanup(a.b.id);
    await cleanup(b.b.id);
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
