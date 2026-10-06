import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { assertActive, type TenantContext } from "./context";
import { renewalStart, termEnd, toPaise, todayIST } from "./domain";
import {
  BillingError,
  orderSchema,
  paymentSchema,
  razorpayConfig,
  razorpayRequest,
  validRazorpaySignature,
  type RazorpayPayment,
} from "./razorpay";

export async function billingOwner(ctx: TenantContext) {
  if (ctx.role !== "OWNER" || ctx.support)
    throw new BillingError(
      "Only a business owner can manage billing. Support sessions cannot make payments.",
      403,
    );
  await assertActive(ctx, { allowExpired: true });
}

export async function saveBusinessFee(
  actorId: string,
  businessId: string,
  amount: string,
) {
  const user = await db.user.findUnique({ where: { id: actorId } });
  if (!user?.platformAdmin)
    throw new BillingError("Platform administrator access required.", 403);
  const fee = amount.trim() ? toPaise(amount) : null;
  if (fee !== null && (fee < 100 || fee > 999999999))
    throw new BillingError(
      "The monthly fee must be between ₹1 and ₹99,99,999.99.",
    );
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
    await tx.business.update({
      where: { id: businessId },
      data: { monthlyFeePaise: fee },
    });
    await tx.auditLog.create({
      data: {
        businessId,
        actorId,
        action: "BUSINESS_FEE_CHANGED",
        detail:
          fee === null
            ? "Monthly billing disabled"
            : `Monthly fee: ${fee} paise INR; applies to new checkout orders`,
      },
    });
  });
}

export async function createBillingOrder(ctx: TenantContext) {
  await billingOwner(ctx);
  const { keyId } = razorpayConfig();
  const order = await db.$transaction(
    async (tx) => {
      // Serialize open checkouts across tabs and owners. Only an unpaid provider order is created here.
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${ctx.businessId} FOR UPDATE`;
      const business = await tx.business.findUniqueOrThrow({
        where: { id: ctx.businessId },
      });
      if (business.status !== "ACTIVE")
        throw new BillingError("This business is suspended.", 403);
      if (!business.monthlyFeePaise)
        throw new BillingError(
          "A monthly fee has not been configured for this business.",
        );
      const existing = await tx.businessBillingOrder.findFirst({
        where: {
          businessId: ctx.businessId,
          amountPaise: business.monthlyFeePaise,
          razorpayKeyId: keyId,
          paidAt: null,
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return existing;
      const receipt = randomUUID();
      const remote = orderSchema.parse(
        await razorpayRequest("orders", {
          amount: business.monthlyFeePaise,
          currency: "INR",
          receipt,
          partial_payment: false,
          notes: {
            businessId: business.id,
            purpose: "clubhouse_monthly_billing",
          },
        }),
      );
      if (
        remote.amount !== business.monthlyFeePaise ||
        remote.currency !== "INR" ||
        remote.receipt !== receipt
      )
        throw new BillingError(
          "Razorpay returned an unexpected order. Please contact support.",
          502,
        );
      return tx.businessBillingOrder.create({
        data: {
          businessId: business.id,
          amountPaise: remote.amount,
          currency: "INR",
          razorpayKeyId: keyId,
          razorpayOrderId: remote.id,
          createdBy: ctx.userId,
        },
      });
    },
    { timeout: 20000, maxWait: 5000 },
  );
  return {
    id: order.id,
    keyId: order.razorpayKeyId,
    orderId: order.razorpayOrderId,
    amount: order.amountPaise,
    currency: order.currency,
  };
}

// Both the verified browser callback and signed webhook use this transaction.
export async function settleBillingPayment(payment: RazorpayPayment) {
  const match = await db.businessBillingOrder.findUnique({
    where: { razorpayOrderId: payment.order_id },
  });
  if (!match) return null; // Another product may share the Razorpay account.
  if (
    payment.amount !== match.amountPaise ||
    payment.currency !== match.currency
  )
    throw new BillingError(
      "Payment amount or currency does not match the billing order.",
    );
  if (
    payment.status !== "captured" ||
    !payment.captured ||
    payment.amount_refunded !== 0
  )
    return { paid: false };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${match.businessId} FOR UPDATE`;
    const order = await tx.businessBillingOrder.findUniqueOrThrow({
      where: { id: match.id },
    });
    if (order.paidAt) {
      if (order.razorpayPaymentId !== payment.id)
        throw new BillingError(
          "A different payment already settled this order.",
        );
      return { paid: true };
    }
    const business = await tx.business.findUniqueOrThrow({
      where: { id: match.businessId },
    });
    const periodStart = renewalStart(business.billingPaidThrough, todayIST());
    const periodEnd = termEnd(periodStart, 1);
    await tx.businessBillingOrder.update({
      where: { id: order.id },
      data: {
        razorpayPaymentId: payment.id,
        paidAt: new Date(),
        periodStart,
        periodEnd,
      },
    });
    await tx.business.update({
      where: { id: business.id },
      data: { billingPaidThrough: periodEnd },
    });
    await tx.auditLog.create({
      data: {
        businessId: business.id,
        actorId: "razorpay",
        action: "BUSINESS_BILLING_PAID",
        entityId: order.id,
        detail: `${payment.id}: ${payment.amount} paise ${payment.currency}; ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`,
      },
    });
    return { paid: true };
  });
}

export const checkoutResultSchema = z.object({
  billingOrderId: z.string().min(1).max(100),
  razorpay_order_id: z.string().regex(/^order_[a-zA-Z0-9]+$/),
  razorpay_payment_id: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
});

async function ownedOrder(ctx: TenantContext, id: string) {
  await billingOwner(ctx);
  const order = await db.businessBillingOrder.findFirst({
    where: { id, businessId: ctx.businessId },
  });
  if (!order) throw new BillingError("Billing order not found.", 404);
  return order;
}

export async function verifyBillingCheckout(
  ctx: TenantContext,
  input: z.infer<typeof checkoutResultSchema>,
) {
  const order = await ownedOrder(ctx, input.billingOrderId);
  const { keyId, keySecret } = razorpayConfig();
  if (order.razorpayKeyId !== keyId)
    throw new BillingError(
      "The payment keys have changed. Contact the platform administrator.",
      409,
    );
  if (
    input.razorpay_order_id !== order.razorpayOrderId ||
    !validRazorpaySignature(
      `${order.razorpayOrderId}|${input.razorpay_payment_id}`,
      input.razorpay_signature,
      keySecret,
    )
  )
    throw new BillingError("Payment signature verification failed.");
  const payment = paymentSchema.parse(
    await razorpayRequest(`payments/${input.razorpay_payment_id}`),
  );
  if (
    payment.id !== input.razorpay_payment_id ||
    payment.order_id !== order.razorpayOrderId
  )
    throw new BillingError("Payment does not belong to this billing order.");
  return settleBillingPayment(payment);
}

export async function checkBillingOrder(ctx: TenantContext, id: string) {
  const order = await ownedOrder(ctx, id);
  if (order.paidAt) return { paid: true };
  if (order.razorpayKeyId !== razorpayConfig().keyId)
    throw new BillingError(
      "The payment keys have changed. Contact the platform administrator.",
      409,
    );
  const result = z
    .object({ items: z.array(paymentSchema) })
    .parse(await razorpayRequest(`orders/${order.razorpayOrderId}/payments`));
  const captured = result.items.find(
    (p) =>
      p.order_id === order.razorpayOrderId &&
      p.status === "captured" &&
      p.captured &&
      p.amount_refunded === 0,
  );
  return captured ? settleBillingPayment(captured) : { paid: false };
}

export async function processBillingWebhook(
  raw: Buffer,
  signature: string | null,
) {
  const { webhookSecret } = razorpayConfig();
  if (!validRazorpaySignature(raw, signature, webhookSecret))
    throw new BillingError("Invalid webhook signature.", 400);
  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new BillingError("Invalid webhook JSON.");
  }
  const envelope = z
    .object({ event: z.string(), payload: z.unknown() })
    .safeParse(body);
  if (!envelope.success) throw new BillingError("Invalid webhook event.");
  if (!["payment.captured", "order.paid"].includes(envelope.data.event)) return;
  const payload = z
    .object({ payment: z.object({ entity: paymentSchema }) })
    .safeParse(envelope.data.payload);
  if (!payload.success) throw new BillingError("Invalid webhook payment.");
  await settleBillingPayment(payload.data.payment.entity);
}
