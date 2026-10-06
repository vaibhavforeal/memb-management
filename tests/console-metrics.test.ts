import { describe, expect, it } from "vitest";
import { summarizeWorkspaces } from "../src/lib/console/queries";

const now = new Date("2026-10-06T06:00:00Z");
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const base = {
  status: "ACTIVE",
  monthlyFeePaise: 49_900 as number | null,
  trialRequired: true,
  trialEndsAt: null as Date | null,
  billingPaidThrough: null as Date | null,
};

describe("summarizeWorkspaces", () => {
  const rows = [
    { ...base, trialEndsAt: day("2026-10-08") }, // TRIAL
    { ...base, billingPaidThrough: day("2026-11-01") }, // PAID
    {
      ...base,
      trialEndsAt: day("2026-10-01"),
      billingPaidThrough: day("2026-09-01"),
    }, // PAYMENT_DUE
    { ...base, trialEndsAt: day("2026-10-01") }, // TRIAL_EXPIRED
    { ...base }, // TRIAL_PENDING
    { ...base, trialRequired: false }, // LEGACY
    {
      ...base,
      status: "SUSPENDED",
      billingPaidThrough: day("2026-11-01"),
      monthlyFeePaise: 100_000,
    },
    { ...base, billingPaidThrough: day("2026-11-01"), monthlyFeePaise: null },
  ];

  it("buckets one of each state and counts suspended separately", () => {
    const { byState } = summarizeWorkspaces(rows, now);
    expect(byState).toEqual({
      TRIAL: 1,
      PAID: 2,
      PAYMENT_DUE: 1,
      TRIAL_EXPIRED: 1,
      TRIAL_PENDING: 1,
      LEGACY: 1,
      SUSPENDED: 1,
    });
  });

  it("sums MRR over paid, non-suspended workspaces, treating null fee as 0", () => {
    expect(summarizeWorkspaces(rows, now).mrrPaise).toBe(49_900);
  });
});
