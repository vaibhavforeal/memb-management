import { NextResponse, type NextRequest } from "next/server";
import { consoleRoute } from "@/lib/console/route";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const result = consoleRoute(host, request.nextUrl.pathname, {
    consoleHost: process.env.CONSOLE_HOST,
    consoleUrl: process.env.CONSOLE_URL,
  });
  switch (result.type) {
    case "rewrite":
      return NextResponse.rewrite(
        new URL(result.pathname + request.nextUrl.search, request.url),
      );
    case "redirect":
      return NextResponse.redirect(result.url);
    case "not-found":
      // Rewrite to a path that does not exist so Next renders its standard 404 page (status 404).
      return NextResponse.rewrite(new URL("/_not-found-console", request.url));
    default:
      return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
