export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp";
export function memberPhotoUrl(memberId: string, version?: string | null) {
  return version
    ? `/api/members/${encodeURIComponent(memberId)}/photo?v=${encodeURIComponent(version)}`
    : null;
}
