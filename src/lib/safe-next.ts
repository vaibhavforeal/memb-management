/**
 * Sanitises a post-login `next` target: only same-origin relative paths are
 * allowed (e.g. `/members?tab=x`). Anything that could resolve to another
 * origin (`//host`, `/\host`, absolute URLs, backslashes, control characters)
 * yields the fallback.
 */
export function safeNext(
  value: string | undefined,
  fallback = "/dashboard",
): string {
  if (typeof value !== "string" || value === "") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const base = "http://x";
    if (new URL(value, base).origin !== new URL(base).origin) return fallback;
  } catch {
    return fallback;
  }
  return value;
}
