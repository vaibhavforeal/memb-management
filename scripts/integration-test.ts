import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  addDays,
  atHourIST,
  balance,
  dayString,
  todayIST,
} from "../src/lib/domain";
import {
  checkIn,
  createMembership,
  importMembers,
  memberFor,
  recordPayment,
  reversePayment,
  saveMember,
  cancelMembership,
} from "../src/lib/services";
import {
  createCampaign,
  deliverMessage,
  processWebhook,
  recoverInterruptedMessages,
  scheduleReminders,
} from "../src/lib/messaging";
import { DeliveryError } from "../src/lib/whatsapp";
import { encrypt } from "../src/lib/security";
import { fixture, cleanup, ensureLocalTest } from "./test-support";

async function main() {
  ensureLocalTest();
  process.env.WHATSAPP_MODE = "cloud";
  process.env.WHATSAPP_DRY_RUN = "false";
  const first = await fixture("itest"),
    second = await fixture("itest");
  const { ctx } = first;
  const today = todayIST(),
    now = atHourIST(today, 12);
  let assertions = 0;
  const pass = (label: string) => {
    assertions++;
    console.info(`PASS ${label}`);
  };
  try {
    const imported = await importMembers(ctx, [
      {
        name: "Integration Member",
        phone: "9876543210",
        email: "member@example.test",
      },
    ]);
    assert.equal(imported.created, 1);
    const original = await db.member.findFirstOrThrow({
      where: { businessId: ctx.businessId },
      include: { contact: true },
    });
    assert.equal(original.contact.serviceConsent, false);
    assert.equal(original.contact.optedOutAt, null);
    pass("Imported contacts are enabled without rewriting historical consent");
    const duplicate = await importMembers(ctx, [
      { name: "Integration Member", phone: "9876543210" },
    ]);
    assert.equal(duplicate.skipped, 1);
    pass("Repeated import skips existing members");
    await assert.rejects(() => memberFor(second.ctx, original.id), /not found/);
    pass("Cross-business member access is rejected");
    await saveMember(
      ctx,
      {
        name: original.name,
        phone: original.contact.phone,
      },
      original.id,
    );
    const plan = await db.plan.create({
      data: {
        businessId: ctx.businessId,
        name: "Test monthly",
        months: 1,
        amountPaise: 250000,
      },
    });
    const term = await createMembership(ctx, {
      memberId: original.id,
      planId: plan.id,
      startDate: dayString(today),
      dueDate: dayString(addDays(today, -1)),
    });
    const charge = await db.charge.findUniqueOrThrow({
      where: { membershipId: term.id },
    });
    await assert.rejects(
      () =>
        createMembership(ctx, {
          memberId: original.id,
          planId: plan.id,
          startDate: dayString(today),
          dueDate: dayString(today),
        }),
      /overlap/,
    );
    pass("Overlapping memberships are rejected");
    const paymentInput = {
      chargeId: charge.id,
      amountPaise: 100000,
      method: "UPI",
      reference: "test",
      idempotencyKey: randomUUID(),
    };
    const payment = await recordPayment(ctx, paymentInput);
    const replay = await recordPayment(ctx, paymentInput);
    assert.equal(payment.id, replay.id);
    pass("Repeated payment submission is idempotent");
    await assert.rejects(
      () =>
        recordPayment(second.ctx, {
          ...paymentInput,
          idempotencyKey: randomUUID(),
        }),
      /not found/,
    );
    pass("Cross-business charge access is rejected");
    const staff = await db.user.create({
      data: {
        id: randomUUID(),
        name: "Test staff",
        email: `${randomUUID()}@example.test`,
      },
    });
    await db.staffAccess.create({
      data: { businessId: ctx.businessId, userId: staff.id, role: "STAFF" },
    });
    const staffCtx = { ...ctx, userId: staff.id, role: "STAFF" as const };
    await assert.rejects(
      () => reversePayment(staffCtx, payment.id, "test reversal"),
      /owner/,
    );
    pass("Staff cannot reverse payments");
    await checkIn(ctx, original.id);
    await checkIn(ctx, original.id);
    assert.equal(
      await db.checkin.count({
        where: { businessId: ctx.businessId, memberId: original.id },
      }),
      1,
    );
    pass("Check-in is once per member per local day");
    await db.whatsAppConnection.create({
      data: {
        businessId: ctx.businessId,
        phoneNumberId: `test-${first.b.id}`,
        accountId: "test",
        encryptedToken: encrypt("test-only"),
        status: "ACTIVE",
        nextSendAt: new Date(0),
      },
    });
    const template = await db.messageTemplate.create({
      data: {
        businessId: ctx.businessId,
        name: "test_dues",
        category: "UTILITY",
        status: "APPROVED",
        body: "Hi {{1}}, balance {{2}}",
        parameterKeys: ["name", "amount"],
        purpose: "DUES",
        providerId: "test-template",
      },
    });
    await db.business.update({
      where: { id: ctx.businessId },
      data: { remindersEnabled: true },
    });
    await scheduleReminders(now);
    await scheduleReminders(now);
    const queued = await db.message.findMany({
      where: { businessId: ctx.businessId, chargeId: charge.id },
    });
    assert.equal(queued.length, 1);
    pass("Repeated scheduler ticks do not duplicate reminders");
    let calls = 0;
    const send = async () => {
      calls++;
      return `wamid-${randomUUID()}`;
    };
    await deliverMessage(
      queued[0].id,
      async (_sender, _token, _phone, _template, parameters) => {
        assert.deepEqual(parameters, [original.name, "₹1,500"]);
        return send();
      },
      now,
    );
    assert.equal(calls, 1);
    assert.equal(
      (await db.message.findUniqueOrThrow({ where: { id: queued[0].id } }))
        .status,
      "SENT",
    );
    pass(
      "A partial payment produces a due reminder with the remaining balance",
    );
    const later = addDays(now, 6);
    await scheduleReminders(later);
    const secondReminder = await db.message.findFirstOrThrow({
      where: {
        businessId: ctx.businessId,
        chargeId: charge.id,
        status: "QUEUED",
      },
    });
    await recordPayment(ctx, {
      ...paymentInput,
      amountPaise: 150000,
      idempotencyKey: randomUUID(),
    });
    await deliverMessage(secondReminder.id, send, later);
    assert.equal(calls, 1);
    assert.equal(
      (await db.message.findUniqueOrThrow({ where: { id: secondReminder.id } }))
        .status,
      "SUPPRESSED",
    );
    pass("Paying the outstanding balance suppresses the queued reminder");
    calls = 0;
    await reversePayment(
      ctx,
      payment.id,
      "Payment was entered against the wrong reference",
    );
    assert.equal(
      balance(
        await db.charge.findUniqueOrThrow({
          where: { id: charge.id },
          include: { payments: true },
        }),
      ),
      100000,
    );
    await assert.rejects(
      () => reversePayment(ctx, payment.id, "Duplicate reversal"),
      /already/,
    );
    pass("Reversal restores the balance and cannot be repeated");
    const competing = await Promise.allSettled([
      recordPayment(ctx, {
        ...paymentInput,
        amountPaise: 60000,
        idempotencyKey: randomUUID(),
      }),
      recordPayment(ctx, {
        ...paymentInput,
        amountPaise: 60000,
        idempotencyKey: randomUUID(),
      }),
    ]);
    assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
    pass("Concurrent payments cannot overpay a charge");
    const announcement = await db.messageTemplate.create({
      data: {
        businessId: ctx.businessId,
        name: "test_update",
        category: "MARKETING",
        status: "APPROVED",
        body: "Hi {{1}}",
        parameterKeys: ["name"],
        purpose: "ANNOUNCEMENT",
        providerId: "test-announcement",
      },
    });
    const campaign = await createCampaign(ctx, {
      name: "Test campaign",
      templateId: announcement.id,
      segment: "selected",
      selected: [original.id],
      scheduledAt: new Date(),
      expectedCount: 1,
      requestId: randomUUID(),
    });
    const msg = await db.message.findFirstOrThrow({
      where: { campaignId: campaign.id },
    });
    const sendNow = new Date(Date.now() + 1000);
    await db.whatsAppConnection.update({
      where: { businessId: ctx.businessId },
      data: { nextSendAt: new Date(0) },
    });
    await deliverMessage(msg.id, send, sendNow);
    await deliverMessage(msg.id, send, sendNow);
    assert.equal(calls, 1);
    pass("An already sent message cannot be sent twice");
    const sent = await db.message.findUniqueOrThrow({ where: { id: msg.id } });
    for (const status of ["read", "delivered", "failed", "read"])
      await processWebhook({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: `test-${first.b.id}` },
                  statuses: [
                    {
                      id: sent.providerMessageId!,
                      status,
                      timestamp: "1790956800",
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
    assert.equal(
      (await db.message.findUniqueOrThrow({ where: { id: msg.id } })).status,
      "READ",
    );
    pass("Duplicate and out-of-order webhook statuses preserve read delivery");
    const uncertain = await db.message.create({
      data: {
        businessId: ctx.businessId,
        memberId: original.id,
        templateId: announcement.id,
        kind: "ANNOUNCEMENT",
        phone: original.contact.phone,
        idempotencyKey: randomUUID(),
        scheduledAt: new Date(0),
      },
    });
    await db.whatsAppConnection.update({
      where: { businessId: ctx.businessId },
      data: { nextSendAt: new Date(0) },
    });
    await deliverMessage(
      uncertain.id,
      async () => {
        throw new DeliveryError("unknown test", "unknown");
      },
      new Date(),
    );
    assert.equal(
      (await db.message.findUniqueOrThrow({ where: { id: uncertain.id } }))
        .status,
      "UNKNOWN",
    );
    pass("Uncertain network outcomes are not automatically retried");
    await db.message.update({
      where: { id: uncertain.id },
      data: { status: "PROCESSING", updatedAt: new Date(Date.now() - 300000) },
    });
    await recoverInterruptedMessages();
    assert.equal(
      (await db.message.findUniqueOrThrow({ where: { id: uncertain.id } }))
        .status,
      "UNKNOWN",
    );
    pass("Worker interruption moves in-flight sends to review");
    const pendingAnnouncement = () =>
      db.message.create({
        data: {
          businessId: ctx.businessId,
          memberId: original.id,
          templateId: announcement.id,
          kind: "ANNOUNCEMENT",
          phone: original.contact.phone,
          idempotencyKey: randomUUID(),
          scheduledAt: new Date(0),
        },
      });
    const assertSuppressed = async (id: string, reason: string) => {
      const callsBefore = calls;
      await deliverMessage(id, send, new Date());
      const result = await db.message.findUniqueOrThrow({ where: { id } });
      assert.equal(result.status, "SUPPRESSED");
      assert.match(result.lastError ?? "", new RegExp(reason));
      assert.equal(calls, callsBefore);
    };
    const rejected = await pendingAnnouncement();
    await db.messageTemplate.update({
      where: { id: announcement.id },
      data: { status: "REJECTED" },
    });
    await assertSuppressed(rejected.id, "Template unavailable");
    await db.messageTemplate.update({
      where: { id: announcement.id },
      data: { status: "APPROVED" },
    });
    pass("Template rejection suppresses previously queued messages");
    const disconnected = await pendingAnnouncement();
    await db.whatsAppConnection.update({
      where: { businessId: ctx.businessId },
      data: { status: "DISCONNECTED" },
    });
    await assertSuppressed(disconnected.id, "WhatsApp disconnected");
    await db.whatsAppConnection.update({
      where: { businessId: ctx.businessId },
      data: { status: "ACTIVE" },
    });
    pass("Disconnected senders cannot deliver queued messages");
    const suspended = await pendingAnnouncement();
    await db.business.update({
      where: { id: ctx.businessId },
      data: { status: "SUSPENDED" },
    });
    await assertSuppressed(suspended.id, "Business or member inactive");
    await db.business.update({
      where: { id: ctx.businessId },
      data: { status: "ACTIVE" },
    });
    pass("Suspension suppresses previously queued messages");
    const optedOut = await pendingAnnouncement();
    await processWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: `test-${first.b.id}` },
                messages: [
                  {
                    id: "stop-test",
                    from: "919876543210",
                    text: { body: "STOP" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    assert.equal(
      (
        await db.contact.findUniqueOrThrow({
          where: { id: original.contactId },
        })
      ).optedOutAt !== null,
      true,
    );
    pass("STOP webhook opts the contact out");
    await assertSuppressed(optedOut.id, "Member opted out");
    pass("An opt-out suppresses previously queued messages");
    await cancelMembership(ctx, term.id);
    await assert.rejects(() => checkIn(ctx, original.id), /active membership/);
    pass("Cancelled memberships cannot check in");
    await db.business.update({
      where: { id: second.ctx.businessId },
      data: { status: "SUSPENDED" },
    });
    await assert.rejects(
      () => saveMember(second.ctx, { name: "Blocked", phone: "9876543211" }),
      /not active/,
    );
    pass("Suspended businesses cannot mutate records");
    console.info(
      `${assertions} integration scenarios passed against PostgreSQL.`,
    );
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
