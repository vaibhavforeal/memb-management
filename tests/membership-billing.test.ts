import { describe, expect, it } from "vitest";
import {
  calculateMembershipBill as bill,
  parseDiscount,
  percentageBps,
} from "../src/lib/membership-billing";

describe("membership billing", () => {
  it("keeps existing untaxed fees unchanged", () => {
    expect(bill({ baseAmountPaise: 250000 })).toMatchObject({
      amountPaise: 250000,
      taxPaise: 0,
      discountPaise: 0,
    });
  });
  it("discounts membership plus admission before adding tax", () => {
    expect(
      bill({
        baseAmountPaise: 100000,
        admissionFeePaise: 50000,
        taxRateBps: 1800,
        discountType: "PERCENT",
        discountValue: 1000,
      }),
    ).toMatchObject({
      discountPaise: 15000,
      taxPaise: 24300,
      amountPaise: 159300,
    });
  });
  it("extracts inclusive tax after a fixed discount", () => {
    expect(
      bill({
        baseAmountPaise: 118000,
        admissionFeePaise: 59000,
        taxRateBps: 1800,
        taxInclusive: true,
        discountType: "FIXED",
        discountValue: 11800,
      }),
    ).toMatchObject({
      discountPaise: 11800,
      taxPaise: 25200,
      amountPaise: 165200,
    });
  });
  it("rounds percentage discounts and tax to the nearest paise", () => {
    expect(
      bill({
        baseAmountPaise: 99999,
        taxRateBps: 1800,
        discountType: "PERCENT",
        discountValue: 1250,
      }),
    ).toMatchObject({
      discountPaise: 12500,
      taxPaise: 15750,
      amountPaise: 103249,
    });
    expect(
      bill({ baseAmountPaise: 101, taxRateBps: 1800, taxInclusive: true }),
    ).toMatchObject({ taxPaise: 15, amountPaise: 101 });
  });
  it.each([false, true])(
    "allows a fully discounted charge (inclusive=%s)",
    (taxInclusive) => {
      expect(
        bill({
          baseAmountPaise: 100000,
          admissionFeePaise: 50000,
          taxRateBps: 1800,
          taxInclusive,
          discountType: "PERCENT",
          discountValue: 10000,
        }),
      ).toMatchObject({ amountPaise: 0, taxPaise: 0, discountPaise: 150000 });
    },
  );
  it("rejects excessive discounts and totals", () => {
    expect(() =>
      bill({ baseAmountPaise: 100, discountType: "FIXED", discountValue: 101 }),
    ).toThrow(/subtotal/);
    expect(() =>
      bill({
        baseAmountPaise: 100,
        discountType: "PERCENT",
        discountValue: 10001,
      }),
    ).toThrow(/100%/);
    expect(() =>
      bill({ baseAmountPaise: 999999999, taxRateBps: 1800 }),
    ).toThrow(/total/);
  });
  it.each([-1, 0.5, NaN, Infinity, 1000000000])(
    "rejects invalid money: %s",
    (baseAmountPaise) => {
      expect(() => bill({ baseAmountPaise })).toThrow();
    },
  );
  it.each(["-1", "100.01", "1.001", "NaN", "1e1", ""])(
    'rejects invalid percentage "%s"',
    (value) => {
      expect(() => percentageBps(value)).toThrow();
    },
  );
  it("parses decimal values exactly", () => {
    expect(percentageBps("12.35")).toBe(1235);
    expect(parseDiscount("FIXED", "0.29")).toEqual({
      discountType: "FIXED",
      discountValue: 29,
    });
    expect(parseDiscount("PERCENT", "12.35")).toEqual({
      discountType: "PERCENT",
      discountValue: 1235,
    });
    expect(() => parseDiscount("OTHER", "10")).toThrow();
  });
});
