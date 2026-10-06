import { getContext } from "./context";
import { billingOwner } from "./business-billing";
import { BillingError } from "./razorpay";

export async function billingContext(request: Request) {
  const canonical = process.env.BETTER_AUTH_URL;
  if (!canonical || request.headers.get("origin") !== new URL(canonical).origin)
    throw new BillingError("Reload the app before managing billing.", 403);
  try {
    const ctx = await getContext({ allowExpired: true });
    await billingOwner(ctx);
    return ctx;
  } catch (error) {
    if (error instanceof BillingError) throw error;
    throw new BillingError(
      "Sign in as the owner of an active business to manage billing.",
      403,
    );
  }
}

export async function readBillingBody(request: Request, maxBytes = 16384) {
  if (!request.body) throw new BillingError("Request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new BillingError("Request body is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export function billingResponse(result: unknown, status = 200) {
  return Response.json(result, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function billingFailure(error: unknown) {
  return billingResponse(
    {
      message:
        error instanceof BillingError
          ? error.message
          : "Billing could not be updated. Check payment status before trying to pay again.",
    },
    error instanceof BillingError ? error.status : 500,
  );
}
