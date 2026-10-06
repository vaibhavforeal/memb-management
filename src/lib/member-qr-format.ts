const prefix = "clubhouse:member:";

export function memberQrPayload(token: string) {
  return `${prefix}${token}`;
}

export function parseMemberQr(raw: string) {
  return /^clubhouse:member:([A-Za-z0-9_-]{43})$/.exec(raw.trim())?.[1] ?? null;
}

export type ScannedMember = {
  name: string;
  code: string;
  status: string;
  canCheckIn: boolean;
  checkedIn: boolean;
};

export type MemberQrCard = {
  name: string;
  code: string;
  business: string;
  image: string;
};
