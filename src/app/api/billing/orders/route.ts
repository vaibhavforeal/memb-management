import { createBillingOrder } from "@/lib/business-billing";
import {
  billingContext,
  billingFailure,
  billingResponse,
} from "@/lib/billing-http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    return billingResponse(
      await createBillingOrder(await billingContext(request)),
      201,
    );
  } catch (error) {
    return billingFailure(error);
  }
}
