import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export class BillingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (
    !keyId ||
    !/^rzp_(test|live)_[a-zA-Z0-9]+$/.test(keyId) ||
    !keySecret ||
    !webhookSecret
  )
    throw new BillingError(
      "Online billing is not configured. Contact the platform administrator.",
      503,
    );
  return { keyId, keySecret, webhookSecret };
}

export function razorpayAvailable() {
  try {
    razorpayConfig();
    return true;
  } catch {
    return false;
  }
}

export function validRazorpaySignature(
  raw: string | Buffer,
  signature: string | null,
  secret: string,
) {
  if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export const paymentSchema = z.object({
  id: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
  order_id: z.string().regex(/^order_[a-zA-Z0-9]+$/),
  amount: z.number().int().positive(),
  currency: z.string(),
  status: z.string(),
  captured: z.boolean(),
  amount_refunded: z.number().int().nonnegative(),
});
export type RazorpayPayment = z.infer<typeof paymentSchema>;
export const orderSchema = z.object({
  id: z.string().regex(/^order_[a-zA-Z0-9]+$/),
  amount: z.number().int().positive(),
  currency: z.string(),
  receipt: z.string(),
});

// Credentials and the API base stay on the server. Never accept a client-supplied amount or URL.
export async function razorpayRequest(
  path: string,
  body?: unknown,
): Promise<unknown> {
  const { keyId, keySecret } = razorpayConfig();
  try {
    const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Provider request failed");
    return await response.json();
  } catch {
    throw new BillingError(
      "Razorpay is unavailable. Check payment status before trying to pay again.",
      502,
    );
  }
}
