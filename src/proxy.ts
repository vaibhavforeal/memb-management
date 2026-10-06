import { NextResponse, type NextRequest } from "next/server";
import { consoleRoute } from "./lib/console/route";

/**
 * Rewrite targets are cloned from the request URL, never built from the Host
 * header (that would be an SSRF vector). Next treats a rewrite whose origin
 * differs from the server's own origin as an external proxy, so in dev the
 * server must be started with `--hostname localhost` (the `dev` script); binding
 * 127.0.0.1 makes every rewrite external because NextURL normalises loopback
 * hosts to localhost. (Plain `next dev` would bind 0.0.0.0, exposing it to the LAN.)
 */
function rewriteTarget(
  request: NextRequest,
  pathname: string,
  keepSearch = true,
): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  if (!keepSearch) url.search = "";
  return url;
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const result = consoleRoute(host, request.nextUrl.pathname, {
    consoleHost: process.env.CONSOLE_HOST,
    consoleUrl: process.env.CONSOLE_URL,
  });
  switch (result.type) {
    case "rewrite":
      return NextResponse.rewrite(rewriteTarget(request, result.pathname));
    case "redirect":
      return NextResponse.redirect(result.url);
    case "not-found":
      // Rewrite to a path that does not exist so Next renders its standard 404 page (status 404).
      return NextResponse.rewrite(
        rewriteTarget(request, "/_not-found-console", false),
      );
    default:
      return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Everything except Next internals and paths with a file extension (static files).
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
    // /console/* must always reach the proxy (main-host 404), even with a dot in the path.
    "/console",
    "/console/:path*",
  ],
};
