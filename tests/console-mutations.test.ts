import { describe, expect, it } from "vitest";
import {
  canRevokeAdmin,
  extendTrialEnd,
  parseMarkPaid,
} from "../src/lib/console/mutations";

const DAY = 86400000;
const now = new Date("2026-10-06T10:00:00.000Z");

describe("extendTrialEnd", () => {
  it("extends from now when there is no trial end", () => {
    expect(extendTrialEnd(null, 14, now)).toEqual(
      new Date(now.getTime() + 14 * DAY),
    );
  });
  it("extends from now when the trial already ended", () => {
    const past = new Date(now.getTime() - 5 * DAY);
    expect(extendTrialEnd(past, 7, now)).toEqual(
      new Date(now.getTime() + 7 * DAY),
    );
  });
  it("extends from the current end when it is in the future", () => {
    const future = new Date(now.getTime() + 3 * DAY);
    expect(extendTrialEnd(future, 10, now)).toEqual(
      new Date(future.getTime() + 10 * DAY),
    );
  });
  it("accepts the 1 and 90 day bounds", () => {
    expect(extendTrialEnd(null, 1, now)).toEqual(new Date(now.getTime() + DAY));
    expect(extendTrialEnd(null, 90, now)).toEqual(
      new Date(now.getTime() + 90 * DAY),
    );
  });
  it("rejects 0, 91 and non-integer day counts", () => {
    expect(() => extendTrialEnd(null, 0, now)).toThrow(/1.90 days/);
    expect(() => extendTrialEnd(null, 91, now)).toThrow(/1.90 days/);
    expect(() => extendTrialEnd(null, 2.5, now)).toThrow(/1.90 days/);
    expect(() => extendTrialEnd(null, Number.NaN, now)).toThrow(/1.90 days/);
  });
});

describe("canRevokeAdmin", () => {
  it("refuses to let an admin revoke themselves", () => {
    expect(canRevokeAdmin("a", "a", 5)).toMatch(/your own/i);
  });
  it("refuses to revoke the last platform admin", () => {
    expect(canRevokeAdmin("a", "b", 1)).toMatch(/at least one/i);
  });
  it("allows revoking another admin when others remain", () => {
    expect(canRevokeAdmin("a", "b", 2)).toBeNull();
  });
});

describe("parseMarkPaid", () => {
  it("accepts a valid date and note", () => {
    expect(parseMarkPaid("2026-11-30", "  Paid by bank transfer  ")).toEqual({
      paidThrough: new Date("2026-11-30T00:00:00.000Z"),
      note: "Paid by bank transfer",
    });
  });
  it("rejects notes outside 10–500 characters", () => {
    expect(() => parseMarkPaid("2026-11-30", "short")).toThrow(/10–500/);
    expect(() => parseMarkPaid("2026-11-30", "x".repeat(501))).toThrow(
      /10–500/,
    );
  });
  it("rejects malformed or impossible dates", () => {
    const note = "Paid by bank transfer";
    expect(() => parseMarkPaid("", note)).toThrow(/valid date/);
    expect(() => parseMarkPaid("30/11/2026", note)).toThrow(/valid date/);
    expect(() => parseMarkPaid("2026-02-30", note)).toThrow(/valid date/);
  });
});
