import { findSharedDownload } from "@/lib/shared-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const file = await findSharedDownload((await params).token);
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (!file?.content)
    return new Response(
      "This file link is unavailable. It may have expired or been revoked. Ask the business for a new link.",
      { status: 404, headers },
    );
  // Force a download so uploaded content never executes in the app's origin.
  const encoded = encodeURIComponent(file.name).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return new Response(new Uint8Array(file.content), {
    headers: {
      ...headers,
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="download.${file.name.split(".").pop()?.toLowerCase()}"; filename*=UTF-8''${encoded}`,
    },
  });
}
