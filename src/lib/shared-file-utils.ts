export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.docx";
export const FILE_TYPES_LABEL =
  "JPG, PNG, WebP, PDF or Word (.docx), up to 10 MB.";

export type SharedFileItem = {
  id: string;
  name: string;
  size: number;
  url: string;
  expiresAt: string;
};

export function messageWithFiles(text: string, files: SharedFileItem[]) {
  return [text.trim(), ...files.map((file) => `${file.name}\n${file.url}`)]
    .filter(Boolean)
    .join("\n\n");
}

export function fileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}
