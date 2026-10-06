import { describe, expect, it } from "vitest";
import {
  billTotals,
  cardTerm,
  documentMoney,
} from "../src/lib/member-document-format";

const day = (date: string) => new Date(`${date}T00:00:00Z`);
describe("member document financial and validity labels", () => {
  it("counts payment reversals, waivers and zero-fee memberships honestly", () => {
    const charge = {
      amountPaise: 159300,
      taxPaise: 24300,
      voidedAt: null as Date | null,
      payments: [{ amountPaise: 100000 }],
    };
    expect(billTotals(charge)).toMatchObject({
      paid: 100000,
      due: 59300,
      taxable: 135000,
      payable: 159300,
      status: "Part paid",
    });
    charge.payments.push({ amountPaise: -100000 });
    expect(billTotals(charge)).toMatchObject({
      paid: 0,
      due: 159300,
      status: "Unpaid",
    });
    charge.voidedAt = new Date();
    expect(billTotals(charge)).toMatchObject({
      due: 0,
      payable: 0,
      status: "Waived",
    });
    expect(
      billTotals({ ...charge, amountPaise: 0, taxPaise: 0, voidedAt: null }),
    ).toMatchObject({ due: 0, status: "No payment required" });
    expect(documentMoney(100050)).toBe("₹1,000.50");
  });
  it("selects current term before a renewal, then the nearest future term", () => {
    const current = {
      id: "current",
      startDate: day("2026-10-01"),
      endDate: day("2026-10-31"),
      cancelledAt: null,
    };
    const next = {
      id: "next",
      startDate: day("2026-11-01"),
      endDate: day("2026-11-30"),
      cancelledAt: null,
    };
    expect(cardTerm([next, current], false, day("2026-10-04"))).toEqual({
      term: current,
      status: "Active",
    });
    expect(cardTerm([next, current], false, day("2026-09-01"))).toEqual({
      term: current,
      status: "Upcoming",
    });
    expect(cardTerm([next, current], false, day("2026-12-01"))).toEqual({
      term: next,
      status: "Expired",
    });
    expect(
      cardTerm(
        [{ ...current, cancelledAt: new Date() }],
        false,
        day("2026-10-04"),
      ).status,
    ).toBe("Cancelled");
    expect(cardTerm([current], true, day("2026-10-04")).status).toBe(
      "Archived",
    );
    expect(cardTerm([])).toEqual({ term: null, status: "No plan" });
  });
});
