// Helpers for the main-host handoff routes (/support/start, /open/[businessId])
// that complete console actions needing main-host cookies.

export const SUPPORT_LINK_INVALID =
  "This support link is invalid or has expired.";
export const OWNER_ACCESS_REQUIRED =
  "You don't have owner access to this workspace.";

export type GrantLike = { actorId: string; expiresAt: Date };

/** The five support-link checks; callers never reveal which one failed. */
export function supportGrantValid(
  grant: GrantLike | null | undefined,
  userId: string,
  isPlatformAdmin: boolean | null | undefined,
  now: Date,
): boolean {
  if (!grant) return false;
  if (grant.actorId !== userId) return false;
  if (!(grant.expiresAt.getTime() > now.getTime())) return false;
  return isPlatformAdmin === true;
}

/** Relative login URL that returns to the original path after sign-in. */
export function loginRedirectPath(pathname: string, search: string): string {
  return `/login?next=${encodeURIComponent(pathname + search)}`;
}

/** Plain 403 page. `message` must be a fixed string, never user input. */
export function forbiddenPage(message: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Access denied · membrr</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; color: #0f172a;">
<h1 style="font-size: 1.25rem;">Access denied</h1>
<p>${message}</p>
<p><a href="/dashboard">Go to dashboard</a></p>
</body>
</html>`;
  return new Response(html, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const workspaceCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
