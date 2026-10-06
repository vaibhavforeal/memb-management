import { processBillingWebhook } from "@/lib/business-billing";
import {
  billingFailure,
  billingResponse,
  readBillingBody,
} from "@/lib/billing-http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await processBillingWebhook(
      await readBillingBody(request, 262144),
      request.headers.get("x-razorpay-signature"),
    );
    return billingResponse({ received: true });
  } catch (error) {
    return billingFailure(error);
  }
}
