import {
  checkoutResultSchema,
  verifyBillingCheckout,
} from "@/lib/business-billing";
import {
  billingContext,
  billingFailure,
  billingResponse,
  readBillingBody,
} from "@/lib/billing-http";
import { BillingError } from "@/lib/razorpay";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const ctx = await billingContext(request);
    let body: unknown;
    const raw = await readBillingBody(request);
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new BillingError("Invalid checkout response.");
    }
    const result = checkoutResultSchema.safeParse(body);
    if (!result.success) throw new BillingError("Invalid checkout response.");
    const status = await verifyBillingCheckout(ctx, result.data);
    return billingResponse(status, status?.paid ? 200 : 202);
  } catch (error) {
    return billingFailure(error);
  }
}
