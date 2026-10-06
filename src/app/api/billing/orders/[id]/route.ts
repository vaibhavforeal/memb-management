import { checkBillingOrder } from "@/lib/business-billing";
import {
  billingContext,
  billingFailure,
  billingResponse,
} from "@/lib/billing-http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await billingContext(request);
    const { id } = await params;
    const status = await checkBillingOrder(ctx, id);
    return billingResponse(status, status?.paid ? 200 : 202);
  } catch (error) {
    return billingFailure(error);
  }
}
