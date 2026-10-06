export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

export function businessLogoUrl(version: string | null | undefined) {
  return version ? `/api/business/logo?v=${encodeURIComponent(version)}` : null;
}
