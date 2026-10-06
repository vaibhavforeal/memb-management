import { getContext, assertActive } from "./context";
import { MAX_FILE_BYTES } from "./shared-file-utils";
import { SharedFileError, shareLinkConfig } from "./shared-files";
import { PlanRequiredError } from "./workspace-access";

export async function sharedFileContext(request: Request) {
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !== shareLinkConfig().origin
  )
    throw new SharedFileError(
      "Reload this app before uploading or revoking a file.",
      403,
    );
  try {
    const ctx = await getContext({ api: true });
    await assertActive(ctx);
    return ctx;
  } catch (error) {
    if (error instanceof PlanRequiredError) throw error;
    throw new SharedFileError(
      "Sign in to an active business to manage files.",
      403,
    );
  }
}

export async function readUpload(request: Request) {
  const declared = request.headers.get("content-length");
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_FILE_BYTES)
  )
    throw new SharedFileError("Choose a file no larger than 10 MB.", 413);
  if (!request.body) throw new SharedFileError("Choose a file to upload.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new SharedFileError("Choose a file no larger than 10 MB.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}

export function sharedFileFailure(error: unknown) {
  return Response.json(
    {
      message:
        error instanceof SharedFileError || error instanceof PlanRequiredError
          ? error.message
          : "The file could not be saved. Please try again.",
      ...(error instanceof PlanRequiredError
        ? { upgradeUrl: error.upgradeUrl }
        : {}),
    },
    {
      status:
        error instanceof SharedFileError || error instanceof PlanRequiredError
          ? error.status
          : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
