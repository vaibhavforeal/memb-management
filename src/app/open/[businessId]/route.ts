import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isConsoleHost } from "@/lib/console/route";
import {
  forbiddenPage,
  loginRedirectPath,
  OWNER_ACCESS_REQUIRED,
  workspaceCookieOptions,
} from "@/lib/handoff";

export const runtime = "nodejs";

/** Completes "Open workspace" from the console: selects the workspace on the main host. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
) {
  if (
    isConsoleHost(request.headers.get("host") ?? "", process.env.CONSOLE_HOST)
  )
    return new Response("Not found", { status: 404 });

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    const { pathname, search } = request.nextUrl;
    return new NextResponse(null, {
      status: 307,
      headers: { Location: loginRedirectPath(pathname, search) },
    });
  }

  const { businessId } = await params;
  const access =
    session.user.platformAdmin === true
      ? await db.staffAccess.findUnique({
          where: {
            businessId_userId: { businessId, userId: session.user.id },
          },
        })
      : null;
  if (access?.role !== "OWNER") return forbiddenPage(OWNER_ACCESS_REQUIRED);

  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: "/dashboard" },
  });
  response.cookies.set("membrr-business", businessId, workspaceCookieOptions);
  response.cookies.delete("membrr-support");
  return response;
}
