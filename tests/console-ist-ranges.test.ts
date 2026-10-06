import { describe, expect, it } from "vitest";
import {
  groupRevenueByMonth,
  istDayRange,
  istMonthRange,
  lastTwelveMonthKeys,
  orderMonthField,
  orderWhere,
} from "../src/lib/console/queries";

const utc = (s: string) => new Date(s);

describe("istMonthRange", () => {
  it("returns the IST month as [start, end) UTC instants", () => {
    expect(istMonthRange("2026-09")).toEqual({
      start: utc("2026-08-31T18:30:00.000Z"),
      end: utc("2026-09-30T18:30:00.000Z"),
    });
  });
  it("rolls December into January of the next year", () => {
    expect(istMonthRange("2026-12")).toEqual({
      start: utc("2026-11-30T18:30:00.000Z"),
      end: utc("2026-12-31T18:30:00.000Z"),
    });
  });
  it("handles February in leap and common years", () => {
    expect(istMonthRange("2028-02")!.end).toEqual(
      utc("2028-02-29T18:30:00.000Z"),
    );
    expect(istMonthRange("2027-02")!.end).toEqual(
      utc("2027-02-28T18:30:00.000Z"),
    );
  });
  it("puts the IST midnight boundary in the right month", () => {
    const sep = istMonthRange("2026-09")!;
    const inSep = utc("2026-08-31T18:30:00.000Z"); // 1 Sep 00:00 IST
    const inAug = utc("2026-08-31T18:29:59.999Z"); // 31 Aug 23:59:59.999 IST
    expect(inSep >= sep.start && inSep < sep.end).toBe(true);
    expect(inAug >= sep.start).toBe(false);
  });
  it("rejects missing or malformed months", () => {
    expect(istMonthRange(undefined)).toBeNull();
    expect(istMonthRange("")).toBeNull();
    expect(istMonthRange("2026-13")).toBeNull();
    expect(istMonthRange("2026-00")).toBeNull();
    expect(istMonthRange("2026-9")).toBeNull();
    expect(istMonthRange("2026-09-01")).toBeNull();
  });
});

describe("istDayRange", () => {
  it("makes an inclusive IST day range into [gte, lt) UTC instants", () => {
    expect(istDayRange("2026-10-01", "2026-10-06")).toEqual({
      gte: utc("2026-09-30T18:30:00.000Z"),
      lt: utc("2026-10-06T18:30:00.000Z"),
    });
  });
  it("covers a single full IST day when from equals to", () => {
    const r = istDayRange("2026-10-06", "2026-10-06");
    expect(+r.lt! - +r.gte!).toBe(86_400_000);
  });
  it("leaves invalid or missing ends open", () => {
    expect(istDayRange()).toEqual({ gte: undefined, lt: undefined });
    expect(istDayRange("2026-02-30", "nope")).toEqual({
      gte: undefined,
      lt: undefined,
    });
    expect(istDayRange(undefined, "2026-12-31")).toEqual({
      gte: undefined,
      lt: utc("2026-12-31T18:30:00.000Z"),
    });
  });
});

describe("monthlyRevenue grouping", () => {
  it("lists the last 12 IST months, newest first, from the IST date", () => {
    // 31 Oct 19:00 UTC is already 1 Nov in IST.
    const keys = lastTwelveMonthKeys(utc("2026-10-31T19:00:00.000Z"));
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2026-11");
    expect(keys[11]).toBe("2025-12");
    expect(lastTwelveMonthKeys(utc("2026-10-31T18:00:00.000Z"))[0]).toBe(
      "2026-10",
    );
  });
  it("groups by IST payment month and ignores out-of-range or unpaid orders", () => {
    const keys = ["2026-10", "2026-09", "2026-08"];
    const rows = groupRevenueByMonth(keys, [
      // 31 Aug 23:59 IST
      { amountPaise: 100, paidAt: utc("2026-08-31T18:29:00.000Z") },
      // 1 Sep 00:00 IST
      { amountPaise: 200, paidAt: utc("2026-08-31T18:30:00.000Z") },
      { amountPaise: 300, paidAt: utc("2026-09-15T06:00:00.000Z") },
      // 1 Nov IST: outside the keys
      { amountPaise: 999, paidAt: utc("2026-10-31T19:00:00.000Z") },
      // July: outside the keys
      { amountPaise: 999, paidAt: utc("2026-07-10T06:00:00.000Z") },
      { amountPaise: 999, paidAt: null },
    ]);
    expect(rows).toEqual([
      { month: "2026-10", paise: 0, orders: 0 },
      { month: "2026-09", paise: 500, orders: 2 },
      { month: "2026-08", paise: 100, orders: 1 },
    ]);
  });
});

describe("order month filter", () => {
  it("filters paid orders by payment date so it agrees with the totals", () => {
    expect(orderMonthField("paid")).toBe("paidAt");
    expect(orderWhere({ status: "paid", month: "2026-09" })).toEqual({
      paidAt: {
        not: null,
        gte: utc("2026-08-31T18:30:00.000Z"),
        lt: utc("2026-09-30T18:30:00.000Z"),
      },
    });
  });
  it("filters other statuses by creation date", () => {
    expect(orderMonthField("pending")).toBe("createdAt");
    expect(orderMonthField(undefined)).toBe("createdAt");
    expect(orderWhere({ status: "pending", month: "2026-09" })).toEqual({
      paidAt: null,
      createdAt: {
        gte: utc("2026-08-31T18:30:00.000Z"),
        lt: utc("2026-09-30T18:30:00.000Z"),
      },
    });
    expect(orderWhere({ month: "2026-09" })).toEqual({
      createdAt: {
        gte: utc("2026-08-31T18:30:00.000Z"),
        lt: utc("2026-09-30T18:30:00.000Z"),
      },
    });
  });
});
