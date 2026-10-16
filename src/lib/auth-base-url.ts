/**
 * Better Auth builds the OAuth redirect URI and sets its state cookie from the
 * base URL. The console runs on its own host with host-only cookies, so a Google
 * round trip started there has to come back there. With a console URL
 * configured, requests to that host resolve to it; everything else (including
 * any unlisted host) keeps resolving to the main URL as before. Better Auth
 * also trusts every allowed host's origin, so the console needs no separate
 * trustedOrigins entry.
 */
export type BetterAuthBaseURL =
  | string
  | { allowedHosts: string[]; fallback: string; protocol: "http" | "https" };

export function betterAuthBaseURL(env: {
  baseUrl?: string;
  consoleUrl?: string;
}): BetterAuthBaseURL | undefined {
  const baseUrl = env.baseUrl?.trim() || undefined;
  const consoleUrl = env.consoleUrl?.trim();
  if (!baseUrl || !consoleUrl) return baseUrl;
  let consoleOrigin: URL;
  try {
    consoleOrigin = new URL(consoleUrl);
  } catch {
    return baseUrl;
  }
  // "console.localhost:3000" parses with scheme "console.localhost:" and no host.
  if (!/^https?:$/.test(consoleOrigin.protocol) || !consoleOrigin.host)
    return baseUrl;
  return {
    // URL.host is lower-cased and drops :443/:80, matching what browsers send.
    allowedHosts: [consoleOrigin.host],
    fallback: baseUrl,
    // Behind Azure's TLS termination the request URL is plain http, so don't derive it.
    protocol: consoleOrigin.protocol === "http:" ? "http" : "https",
  };
}

/**
 * Emailed links are built from the request's base URL, so one requested on the
 * console host would point there (where only the console is served). Moves a
 * link to the main site; the token is valid on either host.
 */
export function onMainSite(url: string, baseUrl?: string): string {
  if (!baseUrl) return url;
  try {
    const main = new URL(baseUrl);
    const link = new URL(url);
    link.protocol = main.protocol;
    link.host = main.host;
    return link.toString();
  } catch {
    return url;
  }
}
