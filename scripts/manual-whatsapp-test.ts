import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { fixture, cleanup, ensureLocalTest } from "./test-support";
import {
  saveMember,
  createMembership,
  recordPayment,
  importMembers,
} from "../src/lib/services";
import {
  manualComposer,
  manualFollowUps,
  recordManualSend,
} from "../src/lib/manual-whatsapp";
import { addDays, dayString, todayIST } from "../src/lib/domain";
import { deliverMessage, scheduleReminders } from "../src/lib/messaging";
async function main() {
  ensureLocalTest();
  process.env.WHATSAPP_MODE = "manual";
  const a = await fixture("itest"),
    b = await fixture("itest");
  try {
    const member = await saveMember(a.ctx, {
      name: "Manual test member",
      phone: "9876543210",
    });
    const plan = await db.plan.create({
      data: {
        businessId: a.b.id,
        name: "Monthly",
        months: 1,
        amountPaise: 250000,
      },
    });
    const term = await createMembership(a.ctx, {
      memberId: member.id,
      planId: plan.id,
      startDate: dayString(todayIST()),
      dueDate: dayString(addDays(todayIST(), -1)),
    });
    const charge = await db.charge.findUniqueOrThrow({
      where: { membershipId: term.id },
    });
    const payment = {
      chargeId: charge.id,
      method: "UPI",
      reference: "manual-test",
    };
    await recordPayment(a.ctx, {
      ...payment,
      amountPaise: 100000,
      idempotencyKey: randomUUID(),
    });
    const composer = await manualComposer(a.ctx, {
      memberId: member.id,
      kind: "DUES",
      referenceId: charge.id,
    });
    assert.equal(composer.recipients[0].reason, "");
    assert.equal(
      (
        await manualComposer(a.ctx, {
          memberId: member.id,
          kind: "ANNOUNCEMENT",
        })
      ).recipients[0].reason,
      "",
    );
    const defaultContact = await db.contact.findUniqueOrThrow({
      where: { id: member.contactId },
    });
    assert.equal(defaultContact.consentAt, null);
    assert.equal(defaultContact.consentSource, null);
    await importMembers(a.ctx, [
      { name: "Imported default member", phone: "9876543211" },
    ]);
    const imported = await db.member.findFirstOrThrow({
      where: { businessId: a.b.id, name: "Imported default member" },
    });
    assert.equal(
      (
        await manualComposer(a.ctx, {
          memberId: imported.id,
          kind: "ANNOUNCEMENT",
        })
      ).recipients[0].reason,
      "",
    );
    assert.match(composer.recipients[0].body, /₹1,500/);
    assert.equal((await manualFollowUps(a.ctx)).dues.length, 1);
    await assert.rejects(
      () => manualComposer(b.ctx, { memberId: member.id }),
      /not found/,
    );
    const input = {
      memberId: member.id,
      phone: " +919876543210".trim(),
      kind: "DUES",
      body: composer.recipients[0].body,
      requestId: randomUUID(),
      confirmed: true,
    };
    await assert.rejects(() =>
      recordManualSend(a.ctx, { ...input, confirmed: false }),
    );
    await assert.rejects(() => recordManualSend(b.ctx, input), /not found/);
    const first = await recordManualSend(a.ctx, input),
      second = await recordManualSend(a.ctx, input);
    assert.equal(first.id, second.id);
    assert.equal(
      await db.manualSend.count({ where: { businessId: a.b.id } }),
      1,
    );
    assert.equal(await db.message.count({ where: { businessId: a.b.id } }), 0);
    const staff = await db.user.create({
      data: {
        id: randomUUID(),
        name: "Test staff",
        email: `${randomUUID()}@example.test`,
      },
    });
    await db.staffAccess.create({
      data: { businessId: a.b.id, userId: staff.id, role: "STAFF" },
    });
    await assert.rejects(
      () =>
        recordManualSend(
          { ...a.ctx, userId: staff.id, role: "STAFF" },
          { ...input, kind: "ANNOUNCEMENT", requestId: randomUUID() },
        ),
      /owner/,
    );
    await recordPayment(a.ctx, {
      ...payment,
      amountPaise: 150000,
      idempotencyKey: randomUUID(),
    });
    assert.equal((await manualFollowUps(a.ctx)).dues.length, 0);
    assert.match(
      (
        await manualComposer(a.ctx, {
          memberId: member.id,
          kind: "DUES",
          referenceId: charge.id,
        })
      ).recipients[0].reason,
      /settled/,
    );
    await db.contact.update({
      where: { id: member.contactId },
      data: { optedOutAt: new Date() },
    });
    await saveMember(
      a.ctx,
      { name: "Updated member", phone: defaultContact.phone },
      member.id,
    );
    await importMembers(a.ctx, [
      { name: "Same family number", phone: defaultContact.phone },
    ]);
    const family = await db.member.findFirstOrThrow({
      where: { businessId: a.b.id, name: "Same family number" },
    });
    assert.equal(family.contactId, member.contactId);
    assert.match(
      (await manualComposer(a.ctx, { memberId: family.id })).recipients[0]
        .reason,
      /opted out/,
    );
    assert.match(
      (await manualComposer(a.ctx, { memberId: member.id })).recipients[0]
        .reason,
      /opted out/,
    );
    await assert.rejects(
      () => recordManualSend(a.ctx, { ...input, requestId: randomUUID() }),
      /opted out/,
    );
    let sends = 0;
    await deliverMessage("any-persisted-job", async () => {
      sends++;
      return "no";
    });
    assert.equal(sends, 0);
    assert.equal(await scheduleReminders(), 0);
    console.info(
      "Manual WhatsApp integration passed: messaging enabled by default, imports, preserved opt-outs on edits and shared numbers, current balance, isolation, confirmation, idempotency, and disabled automatic sending.",
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
