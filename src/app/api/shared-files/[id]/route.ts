import { revokeSharedFile } from "@/lib/shared-files";
import { sharedFileContext, sharedFileFailure } from "@/lib/shared-file-http";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await sharedFileContext(request);
    await revokeSharedFile(ctx, (await params).id);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return sharedFileFailure(error);
  }
}
