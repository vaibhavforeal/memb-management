import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { db } from "../src/lib/db";
import { fixture, cleanup, ensureLocalTest } from "./test-support";
import {
  checkBillingOrder,
  createBillingOrder,
  processBillingWebhook,
  saveBusinessFee,
  settleBillingPayment,
  verifyBillingCheckout,
} from "../src/lib/business-billing";
import { BillingError, type RazorpayPayment } from "../src/lib/razorpay";
import { addDays, termEnd, todayIST } from "../src/lib/domain";

async function main() {
  ensureLocalTest();
  // Fake provider transport only; the application and database transactions are real.
  process.env.RAZORPAY_KEY_ID = "rzp_test_billingfixture";
  process.env.RAZORPAY_KEY_SECRET = "billing-fixture-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "billing-fixture-webhook";
  const realFetch = globalThis.fetch;
  let creates = 0;
  const payments = new Map<string, RazorpayPayment>();
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.ok(
      url.startsWith("https://api.razorpay.com/v1/"),
      "Unexpected external request in billing test",
    );
    if (url.endsWith("/orders") && init?.method === "POST") {
      const data = JSON.parse(String(init.body));
      assert.equal(data.partial_payment, false);
      creates++;
      return Response.json({
        ...data,
        id: `order_fixture${Date.now()}${creates}`,
      });
    }
    const item = [...payments.values()].find((p) =>
      url.endsWith(`/payments/${p.id}`),
    );
    if (item) return Response.json(item);
    const match = url.match(/\/orders\/(order_[a-zA-Z0-9]+)\/payments$/);
    if (match)
      return Response.json({
        items: [...payments.values()].filter((p) => p.order_id === match[1]),
      });
    throw new Error("Unexpected Razorpay request");
  };
  const a = await fixture("itest"),
    b = await fixture("itest");
  const sign = (raw: string, webhook = false) =>
    createHmac(
      "sha256",
      webhook
        ? process.env.RAZORPAY_WEBHOOK_SECRET!
        : process.env.RAZORPAY_KEY_SECRET!,
    )
      .update(raw)
      .digest("hex");
  try {
    await assert.rejects(
      () => saveBusinessFee(b.user.id, a.b.id, "1000"),
      /administrator/,
    );
    await db.user.update({
      where: { id: a.user.id },
      data: { platformAdmin: true },
    });
    for (const amount of ["0", "0.99", "-1", "10000001", "1.001"])
      await assert.rejects(() => saveBusinessFee(a.user.id, a.b.id, amount));
    await assert.rejects(
      () => createBillingOrder(a.ctx),
      /not been configured/,
    );
    await saveBusinessFee(a.user.id, a.b.id, "1499.50");
    await assert.rejects(
      () => createBillingOrder({ ...a.ctx, role: "STAFF" }),
      /owner/,
    );
    await assert.rejects(
      () => createBillingOrder({ ...a.ctx, support: true }),
      /Support/,
    );
    await db.staffAccess.update({
      where: { businessId_userId: { businessId: a.b.id, userId: a.user.id } },
      data: { role: "STAFF" },
    });
    await assert.rejects(() => createBillingOrder(a.ctx), /access has changed/);
    await db.staffAccess.update({
      where: { businessId_userId: { businessId: a.b.id, userId: a.user.id } },
      data: { role: "OWNER" },
    });
    const [order, duplicate] = await Promise.all([
      createBillingOrder(a.ctx),
      createBillingOrder(a.ctx),
    ]);
    assert.equal(order.id, duplicate.id);
    assert.equal(creates, 1);
    assert.equal(order.amount, 149950);
    await assert.rejects(() => checkBillingOrder(b.ctx, order.id), /not found/);
    const payment: RazorpayPayment = {
      id: "pay_fixtureone",
      order_id: order.orderId,
      amount: order.amount,
      currency: "INR",
      status: "authorized",
      captured: false,
      amount_refunded: 0,
    };
    payments.set(payment.id, payment);
    const callback = {
      billingOrderId: order.id,
      razorpay_order_id: order.orderId,
      razorpay_payment_id: payment.id,
      razorpay_signature: sign(`${order.orderId}|${payment.id}`),
    };
    await assert.rejects(
      () => verifyBillingCheckout(b.ctx, callback),
      /not found/,
    );
    await assert.rejects(
      () =>
        verifyBillingCheckout(a.ctx, {
          ...callback,
          razorpay_signature: "0".repeat(64),
        }),
      /signature/,
    );
    await assert.rejects(
      () =>
        verifyBillingCheckout(a.ctx, {
          ...callback,
          razorpay_order_id: "order_wrong",
        }),
      /signature/,
    );
    assert.deepEqual(await verifyBillingCheckout(a.ctx, callback), {
      paid: false,
    });
    assert.equal(
      (await db.business.findUniqueOrThrow({ where: { id: a.b.id } }))
        .billingPaidThrough,
      null,
    );
    payment.status = "captured";
    payment.captured = true;
    await assert.rejects(
      () => settleBillingPayment({ ...payment, amount: payment.amount + 1 }),
      /amount/,
    );
    await assert.rejects(
      () => settleBillingPayment({ ...payment, currency: "USD" }),
      /currency/,
    );
    assert.deepEqual(
      await settleBillingPayment({ ...payment, amount_refunded: 1 }),
      { paid: false },
    );
    const webhook = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: payment } },
    });
    await assert.rejects(
      () => processBillingWebhook(Buffer.from(webhook), "0".repeat(64)),
      /signature/,
    );
    const paid = await Promise.all([
      verifyBillingCheckout(a.ctx, callback),
      processBillingWebhook(Buffer.from(webhook), sign(webhook, true)),
      checkBillingOrder(a.ctx, order.id),
    ]);
    assert.equal(paid[0]?.paid, true);
    const firstEnd = termEnd(todayIST(), 1);
    assert.deepEqual(
      (await db.business.findUniqueOrThrow({ where: { id: a.b.id } }))
        .billingPaidThrough,
      firstEnd,
    );
    assert.equal(
      await db.auditLog.count({
        where: { businessId: a.b.id, action: "BUSINESS_BILLING_PAID" },
      }),
      1,
    );
    const orderPaid = JSON.stringify({
      event: "order.paid",
      payload: { payment: { entity: payment } },
    });
    await processBillingWebhook(Buffer.from(orderPaid), sign(orderPaid, true));
    assert.equal(
      await db.auditLog.count({
        where: { businessId: a.b.id, action: "BUSINESS_BILLING_PAID" },
      }),
      1,
    );
    // Quoted amounts survive fee changes, and captured payments do not unsuspend a workspace.
    const renewal = await createBillingOrder(a.ctx);
    await saveBusinessFee(a.user.id, a.b.id, "1999");
    await db.business.update({
      where: { id: a.b.id },
      data: { status: "SUSPENDED" },
    });
    await assert.rejects(() => createBillingOrder(a.ctx), /not active/);
    await settleBillingPayment({
      ...payment,
      id: "pay_fixturetwo",
      order_id: renewal.orderId,
    });
    const updated = await db.business.findUniqueOrThrow({
      where: { id: a.b.id },
    });
    assert.deepEqual(
      updated.billingPaidThrough,
      termEnd(addDays(firstEnd, 1), 1),
    );
    assert.equal(updated.status, "SUSPENDED");
    assert.equal(await db.payment.count({ where: { businessId: a.b.id } }), 0);
    await saveBusinessFee(a.user.id, a.b.id, "");
    assert.equal(
      (await db.business.findUniqueOrThrow({ where: { id: a.b.id } }))
        .monthlyFeePaise,
      null,
    );
    const ignored = JSON.stringify({ event: "payment.failed", payload: {} });
    await processBillingWebhook(Buffer.from(ignored), sign(ignored, true));
    const other = { ...payment, order_id: "order_otherproduct" };
    assert.equal(await settleBillingPayment(other), null);
    await assert.rejects(
      () => processBillingWebhook(Buffer.from("{"), sign("{", true)),
      BillingError,
    );
    console.info(
      "Business billing passed: fees, owner access, tenant isolation, order reuse, signatures, capture checks, recovery, concurrent callback/webhook idempotency, renewals and suspension preservation.",
    );
  } finally {
    globalThis.fetch = realFetch;
    await cleanup(a.b.id);
    await cleanup(b.b.id);
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
