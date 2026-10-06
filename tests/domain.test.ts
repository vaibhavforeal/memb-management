import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  addDays,
  atHourIST,
  balance,
  dayString,
  memberInput,
  membershipStatus,
  nextDeliveryStatus,
  normalizePhone,
  parseDay,
  renewalStart,
  termEnd,
  todayIST,
  toPaise,
} from "../src/lib/domain";
import { decrypt, encrypt, verifyMetaSignature } from "../src/lib/security";
describe("membership calendar", () => {
  it("uses the Indian calendar day around midnight", () => {
    expect(dayString(todayIST(new Date("2026-10-01T18:29:59Z")))).toBe(
      "2026-10-01",
    );
    expect(dayString(todayIST(new Date("2026-10-01T18:30:00Z")))).toBe(
      "2026-10-02",
    );
  });
  it("rejects impossible dates rather than silently rolling them over", () => {
    expect(() => parseDay("2026-02-30")).toThrow();
    expect(() => parseDay("nope")).toThrow();
  });
  it("calculates inclusive month terms, including month end and leap year", () => {
    expect(dayString(termEnd(parseDay("2026-10-02"), 1))).toBe("2026-11-01");
    expect(dayString(termEnd(parseDay("2026-01-31"), 1))).toBe("2026-02-27");
    expect(dayString(termEnd(parseDay("2028-01-31"), 1))).toBe("2028-02-28");
  });
  it("starts early renewals after the existing term and late renewals today", () => {
    const today = parseDay("2026-10-02");
    expect(dayString(renewalStart(parseDay("2026-10-10"), today))).toBe(
      "2026-10-11",
    );
    expect(renewalStart(parseDay("2026-09-30"), today)).toEqual(today);
  });
  it("schedules 10 a.m. IST as 04:30 UTC", () =>
    expect(atHourIST(parseDay("2026-10-02"), 10).toISOString()).toBe(
      "2026-10-02T04:30:00.000Z",
    ));
  it("does not count cancelled or future memberships as active", () => {
    const today = parseDay("2026-10-02");
    expect(
      membershipStatus(
        [
          {
            startDate: today,
            endDate: addDays(today, 30),
            cancelledAt: new Date(),
          },
        ],
        today,
      ),
    ).toBe("Expired");
    expect(
      membershipStatus(
        [
          {
            startDate: addDays(today, 1),
            endDate: addDays(today, 30),
            cancelledAt: null,
          },
        ],
        today,
      ),
    ).toBe("Upcoming");
  });
});
describe("money", () => {
  it.each([
    ["0.01", 1],
    ["2500", 250000],
    ["100.10", 10010],
    ["9999999.99", 999999999],
  ])("converts %s exactly to integer paise", (value, expected) =>
    expect(toPaise(String(value))).toBe(expected),
  );
  it.each(["-1", "1.001", "1e3", "Infinity", "12,000", ""])(
    "rejects ambiguous or invalid input %s",
    (value) => expect(() => toPaise(value)).toThrow(),
  );
  it("includes reversals when computing outstanding balance", () =>
    expect(
      balance({
        amountPaise: 250000,
        payments: [{ amountPaise: 100000 }, { amountPaise: -100000 }],
      }),
    ).toBe(250000));
});
describe("contacts and delivery", () => {
  it("normalizes Indian numbers", () =>
    expect(normalizePhone("98765 43210")).toBe("+919876543210"));
  it("invalid CSV phones produce validation errors instead of exceptions", () =>
    expect(
      memberInput.safeParse({ name: "Member", phone: "invalid" }).success,
    ).toBe(false));
  it("member forms and imports cannot overwrite messaging preferences", () => {
    const result = memberInput.parse({
      name: "Member",
      phone: "9876543210",
      serviceConsent: true,
      marketingConsent: true,
      consentSource: "old form",
      optedOutAt: null,
    });
    expect(result).not.toHaveProperty("serviceConsent");
    expect(result).not.toHaveProperty("marketingConsent");
    expect(result).not.toHaveProperty("consentSource");
    expect(result).not.toHaveProperty("optedOutAt");
  });
  it("preserves read and delivered state across late or duplicated events", () => {
    expect(nextDeliveryStatus("READ", "DELIVERED")).toBe("READ");
    expect(nextDeliveryStatus("READ", "FAILED")).toBe("READ");
    expect(nextDeliveryStatus("UNKNOWN", "SENT")).toBe("SENT");
    expect(nextDeliveryStatus("SIMULATED", "SENT")).toBe("SIMULATED");
  });
});
describe("credential and webhook security", () => {
  it("encrypts with a unique nonce and rejects tampered ciphertext", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "ab".repeat(32);
    const encrypted = encrypt("token-secret");
    expect(encrypted).not.toContain("token-secret");
    expect(encrypt("token-secret")).not.toBe(encrypted);
    expect(decrypt(encrypted)).toBe("token-secret");
    expect(() => decrypt(encrypted.slice(0, -3) + "bad")).toThrow();
  });
  it("accepts only valid signatures over the exact raw body", () => {
    process.env.META_APP_SECRET = "test-secret";
    const raw = '{"entry":[]}';
    const signature =
      "sha256=" + createHmac("sha256", "test-secret").update(raw).digest("hex");
    expect(verifyMetaSignature(raw, signature)).toBe(true);
    expect(verifyMetaSignature(raw + " ", signature)).toBe(false);
    expect(verifyMetaSignature(raw, "sha256=zz")).toBe(false);
    expect(verifyMetaSignature(raw, null)).toBe(false);
  });
});
