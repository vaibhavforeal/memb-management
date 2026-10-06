import { DAY, todayIST } from "./domain";

export const TRIAL_DAYS = 3;
export const TRIAL_DURATION_MS = TRIAL_DAYS * DAY;
export const SIGNUP_MONTHLY_FEE_PAISE = 49_900;
export type WorkspaceAccess =
  | "LEGACY"
  | "PAID"
  | "TRIAL"
  | "TRIAL_PENDING"
  | "TRIAL_EXPIRED"
  | "PAYMENT_DUE";
type AccessBusiness = {
  trialRequired: boolean;
  trialEndsAt: Date | null;
  billingPaidThrough: Date | null;
};

export function trialEnd(start = new Date()) {
  return new Date(start.getTime() + TRIAL_DURATION_MS);
}

export function workspaceAccess(
  business: AccessBusiness,
  now = new Date(),
): WorkspaceAccess {
  if (!business.trialRequired) return "LEGACY";
  if (
    business.billingPaidThrough &&
    business.billingPaidThrough >= todayIST(now)
  )
    return "PAID";
  if (business.trialEndsAt && business.trialEndsAt > now) return "TRIAL";
  if (business.billingPaidThrough) return "PAYMENT_DUE";
  return business.trialEndsAt ? "TRIAL_EXPIRED" : "TRIAL_PENDING";
}

export function hasWorkspaceAccess(business: AccessBusiness, now = new Date()) {
  return ["LEGACY", "PAID", "TRIAL"].includes(workspaceAccess(business, now));
}

export class PlanRequiredError extends Error {
  readonly status = 402;
  readonly upgradeUrl = "/upgrade";
  constructor() {
    super(
      "Your workspace needs a paid plan. Upgrade to continue using the features.",
    );
  }
}

export function trialDateLabel(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  }).format(new Date(date));
}
