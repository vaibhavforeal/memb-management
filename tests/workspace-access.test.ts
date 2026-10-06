import { describe, expect, it } from "vitest";
import {
  hasWorkspaceAccess,
  trialEnd,
  workspaceAccess,
} from "../src/lib/workspace-access";

const start = new Date("2026-10-04T08:00:00Z");
const ends = new Date("2026-10-07T08:00:00Z");
const trial = {
  trialRequired: true,
  trialEndsAt: ends,
  billingPaidThrough: null,
};

describe("workspace trial and paid access", () => {
  it("grants exactly 72 hours from signup and blocks at the expiry instant", () => {
    expect(trialEnd(start)).toEqual(ends);
    expect(workspaceAccess(trial, start)).toBe("TRIAL");
    expect(hasWorkspaceAccess(trial, new Date(ends.getTime() - 1))).toBe(true);
    expect(workspaceAccess(trial, ends)).toBe("TRIAL_EXPIRED");
    expect(hasWorkspaceAccess(trial, ends)).toBe(false);
  });
  it("restores access for a paid plan and includes the last billing day in IST", () => {
    const paid = {
      ...trial,
      billingPaidThrough: new Date("2026-10-31T00:00:00Z"),
    };
    expect(workspaceAccess(paid, ends)).toBe("PAID");
    expect(hasWorkspaceAccess(paid, new Date("2026-10-31T18:29:59.999Z"))).toBe(
      true,
    );
    expect(workspaceAccess(paid, new Date("2026-10-31T18:30:00Z"))).toBe(
      "PAYMENT_DUE",
    );
  });
  it("keeps the remainder of the trial when an early paid period expires", () => {
    expect(
      workspaceAccess(
        { ...trial, billingPaidThrough: new Date("2026-10-04") },
        new Date("2026-10-05"),
      ),
    ).toBe("TRIAL");
  });
  it("does not enable new workspaces before the first owner signs up", () => {
    expect(workspaceAccess({ ...trial, trialEndsAt: null }, start)).toBe(
      "TRIAL_PENDING",
    );
    expect(hasWorkspaceAccess({ ...trial, trialEndsAt: null }, start)).toBe(
      false,
    );
  });
  it("preserves access for workspaces predating the trial rollout", () => {
    expect(workspaceAccess({ ...trial, trialRequired: false }, ends)).toBe(
      "LEGACY",
    );
    expect(hasWorkspaceAccess({ ...trial, trialRequired: false }, ends)).toBe(
      true,
    );
  });
});
