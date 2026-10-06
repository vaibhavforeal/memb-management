export type ConsoleRouteEnv = { consoleHost?: string; consoleUrl?: string };

export type ConsoleRouteResult =
  | { type: "rewrite"; pathname: string }
  | { type: "redirect"; url: string }
  | { type: "not-found" }
  | { type: "next" };

/**
 * Lower-cases a Host value and drops what does not change the origin a browser
 * means: a trailing root dot on the hostname and the default ports :443 / :80.
 * Any other port is kept, so `console.localhost:3001` stays distinct.
 */
function normalizeHost(host: string): string {
  const value = host.trim().toLowerCase();
  // Anything that is not `name[:port]` (e.g. a dot after the port) is left as is.
  const parts = /^([^:]*)(?::(\d+))?$/.exec(value);
  if (!parts) return value;
  const name = parts[1].replace(/\.$/, "");
  const port = parts[2];
  return port && port !== "443" && port !== "80" ? `${name}:${port}` : name;
}

/** Case-insensitive exact match, port included (default ports and a trailing dot ignored). */
export function isConsoleHost(host: string, consoleHost?: string): boolean {
  if (!consoleHost) return false;
  const expected = normalizeHost(consoleHost);
  return expected !== "" && normalizeHost(host) === expected;
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
