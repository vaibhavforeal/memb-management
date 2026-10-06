import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isConsoleHost } from "@/lib/console/route";
import {
  forbiddenPage,
  loginRedirectPath,
  SUPPORT_LINK_INVALID,
  supportGrantValid,
  workspaceCookieOptions,
} from "@/lib/handoff";

export const runtime = "nodejs";

/** Completes "Start support access" from the console: sets the main-host support cookie. */
export async function GET(request: NextRequest) {
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

  const grantId = request.nextUrl.searchParams.get("grant");
  const grant = grantId
    ? await db.supportGrant.findUnique({ where: { id: grantId } })
    : null;
  if (
    !grant ||
    !supportGrantValid(
      grant,
      session.user.id,
      session.user.platformAdmin,
      new Date(),
    )
  )
    return forbiddenPage(SUPPORT_LINK_INVALID);

  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: "/dashboard" },
  });
  response.cookies.set("membrr-support", grant.id, {
    ...workspaceCookieOptions,
    expires: grant.expiresAt,
  });
  response.cookies.delete("membrr-business");
  return response;
}
