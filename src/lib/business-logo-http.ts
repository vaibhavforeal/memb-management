import { getContext, assertActive } from "./context";
import { BusinessLogoError } from "./business-logo";
import { MAX_LOGO_BYTES } from "./business-logo-utils";
import { PlanRequiredError } from "./workspace-access";

export async function businessLogoContext(request: Request) {
  const reading = request.method === "GET";
  if (
    !reading &&
    request.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL!).origin
  )
    throw new BusinessLogoError(
      "Reload this app before changing the logo.",
      403,
    );
  try {
    const ctx = await getContext({ api: true, allowExpired: reading });
    await assertActive(ctx, { allowExpired: reading });
    if (!reading && ctx.role !== "OWNER")
      throw new BusinessLogoError(
        "Only an owner can change the business logo.",
        403,
      );
    return ctx;
  } catch (error) {
    if (
      error instanceof PlanRequiredError ||
      error instanceof BusinessLogoError
    )
      throw error;
    throw new BusinessLogoError(
      "Sign in to an active business to access its logo.",
      403,
    );
  }
}

export async function readLogoUpload(request: Request) {
  const declared = request.headers.get("content-length");
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_LOGO_BYTES)
  )
    throw new BusinessLogoError("Choose a logo no larger than 2 MB.", 413);
  if (!request.body) throw new BusinessLogoError("Choose a logo to upload.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_LOGO_BYTES) {
        await reader.cancel();
        throw new BusinessLogoError("Choose a logo no larger than 2 MB.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}

export function businessLogoFailure(error: unknown) {
  const known =
    error instanceof BusinessLogoError || error instanceof PlanRequiredError;
  return Response.json(
    {
      message: known
        ? error.message
        : "The logo could not be saved. Please try again.",
      ...(error instanceof PlanRequiredError
        ? { upgradeUrl: error.upgradeUrl }
        : {}),
    },
    {
      status: known ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
