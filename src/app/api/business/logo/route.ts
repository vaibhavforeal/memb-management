import { db } from "@/lib/db";
import { saveBusinessLogo, removeBusinessLogo } from "@/lib/business-logo";
import { businessLogoUrl } from "@/lib/business-logo-utils";
import {
  businessLogoContext,
  businessLogoFailure,
  readLogoUpload,
} from "@/lib/business-logo-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await businessLogoContext(request);
    const logo = await db.businessLogo.findUnique({
      where: { businessId: ctx.businessId },
    });
    if (!logo)
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    return new Response(new Uint8Array(logo.content), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return businessLogoFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await businessLogoContext(request);
    const version = await saveBusinessLogo(ctx, await readLogoUpload(request));
    return Response.json(
      { logoUrl: businessLogoUrl(version), message: "Business logo saved." },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return businessLogoFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await businessLogoContext(request);
    await removeBusinessLogo(ctx);
    return Response.json(
      { message: "Business logo removed." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return businessLogoFailure(error);
  }
}
