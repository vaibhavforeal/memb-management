import {
  listSharedFiles,
  SharedFileError,
  uploadSharedFile,
} from "@/lib/shared-files";
import {
  readUpload,
  sharedFileContext,
  sharedFileFailure,
} from "@/lib/shared-file-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await sharedFileContext(request);
    return Response.json(
      { files: await listSharedFiles(ctx) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return sharedFileFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await sharedFileContext(request);
    let name: string;
    try {
      name = decodeURIComponent(request.headers.get("x-file-name") ?? "");
    } catch {
      throw new SharedFileError("Choose a file with a valid filename.");
    }
    const file = await uploadSharedFile(ctx, name, await readUpload(request));
    return Response.json(
      { file },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return sharedFileFailure(error);
  }
}
