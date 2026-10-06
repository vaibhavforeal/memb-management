// Explicit opt-in preload for the isolated billing browser test server only.
// Never import this file from application code.
import { randomUUID } from "node:crypto";
if (
  process.env.BILLING_E2E_PROVIDER !== "simulated" ||
  process.env.RAZORPAY_KEY_ID !== "rzp_test_browserfixture" ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  ) ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.BETTER_AUTH_URL).hostname,
  )
)
  throw new Error(
    "The simulated provider requires explicit fixture keys and local database/app URLs.",
  );

const realFetch = globalThis.fetch;
const orders = new Map();
const payments = new Map();
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith("https://api.razorpay.com/"))
    return realFetch(input, init);
  if (url === "https://api.razorpay.com/v1/orders" && init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    const id = `order_${randomUUID().replaceAll("-", "")}`;
    const order = { ...body, id };
    orders.set(id, order);
    return Response.json(order);
  }
  const match = url.match(/\/orders\/(order_[a-zA-Z0-9]+)\/payments$/);
  if (match)
    return Response.json({
      items: [...payments.values()].filter((p) => p.order_id === match[1]),
    });
  const paymentId = url.match(/\/payments\/(pay_[a-zA-Z0-9]+)$/)?.[1];
  const order = paymentId && orders.get(paymentId.replace("pay_", "order_"));
  if (order) {
    const payment = {
      id: paymentId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: "captured",
      captured: true,
      amount_refunded: 0,
    };
    payments.set(paymentId, payment);
    return Response.json(payment);
  }
  return Response.json(
    { error: "Unknown simulated provider request" },
    { status: 404 },
  );
};
