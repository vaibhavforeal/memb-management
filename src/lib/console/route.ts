export type ConsoleRouteEnv = { consoleHost?: string; consoleUrl?: string };

export type ConsoleRouteResult =
  | { type: "rewrite"; pathname: string }
  | { type: "redirect"; url: string }
  | { type: "not-found" }
  | { type: "next" };

/** Case-insensitive exact match, port included. */
export function isConsoleHost(host: string, consoleHost?: string): boolean {
  if (!consoleHost) return false;
  return host.trim().toLowerCase() === consoleHost.trim().toLowerCase();
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function consoleRoute(
  host: string,
  pathname: string,
  env: ConsoleRouteEnv,
): ConsoleRouteResult {
  if (isConsoleHost(host, env.consoleHost)) {
    if (isUnder(pathname, "/api")) return { type: "next" };
    if (isUnder(pathname, "/console")) return { type: "rewrite", pathname };
    return {
      type: "rewrite",
      pathname: pathname === "/" ? "/console" : `/console${pathname}`,
    };
  }
  if (isUnder(pathname, "/console")) return { type: "not-found" };
  if (isUnder(pathname, "/admin")) {
    // consoleHost unset means the console is disabled entirely.
    if (env.consoleHost && env.consoleUrl) {
      return { type: "redirect", url: env.consoleUrl };
    }
    return { type: "not-found" };
  }
  return { type: "next" };
}
