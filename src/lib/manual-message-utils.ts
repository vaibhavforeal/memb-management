import { normalizePhone } from "./domain";

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${normalizePhone(phone).slice(1)}?text=${encodeURIComponent(text)}`;
}

export function personalizeMessage(
  text: string,
  name: string,
  business: string,
) {
  return text.replace(/\{(name|business)\}/g, (_, key: string) =>
    key === "name" ? name : business,
  );
}

export const manualKinds = [
  "UPDATE",
  "RENEWAL",
  "DUES",
  "ANNOUNCEMENT",
] as const;
export type ManualKind = (typeof manualKinds)[number];
