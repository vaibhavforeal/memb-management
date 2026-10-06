import { describe, expect, it } from "vitest";
import { parseDay } from "../src/lib/domain";
import {
  parseReportFilters,
  reportBounds,
  reportCsvCell,
  reportQuery,
  reportRange,
} from "../src/lib/report-filters";

describe("report date ranges", () => {
  it("uses Monday–Sunday weeks across year boundaries", () => {
    expect(reportRange("this-week", parseDay("2027-01-03"))).toEqual({
      from: parseDay("2026-12-28"),
      to: parseDay("2027-01-03"),
    });
    expect(reportRange("last-week", parseDay("2027-01-04"))).toEqual({
      from: parseDay("2026-12-28"),
      to: parseDay("2027-01-03"),
    });
  });
  it("handles leap February and previous year months", () => {
    expect(reportRange("last-month", parseDay("2028-03-01")).to).toEqual(
      parseDay("2028-02-29"),
    );
    expect(reportRange("last-month", parseDay("2027-01-01")).from).toEqual(
      parseDay("2026-12-01"),
    );
  });
  it("uses inclusive IST days with an exclusive following midnight", () => {
    const f = parseReportFilters({
      type: "collections",
      period: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(reportBounds(f)).toEqual({
      gte: new Date("2026-08-31T18:30:00Z"),
      lt: new Date("2026-09-30T18:30:00Z"),
    });
  });
  it.each([
    ["2026-02-30", "2026-03-01"],
    ["2026-10-05", "2026-10-04"],
    ["", "2026-10-04"],
    ["2025-01-01", "2026-10-04"],
  ])("rejects invalid, reversed and oversized ranges (%s, %s)", (from, to) => {
    expect(() =>
      parseReportFilters({ type: "collections", period: "custom", from, to }),
    ).toThrow();
  });
  it("defaults renewals to the next 30 inclusive days", () => {
    const f = parseReportFilters({ type: "renewals" }, parseDay("2026-10-04"));
    expect(f.from).toBe("2026-10-04");
    expect(f.to).toBe("2026-11-02");
  });
  it("only honours the next-30 period for renewals", () => {
    const today = parseDay("2026-10-04");
    expect(
      parseReportFilters({ type: "collections", period: "next-30" }, today),
    ).toMatchObject({ period: "this-month", from: "2026-10-01" });
    expect(
      parseReportFilters({ type: "renewals", period: "next-30" }, today),
    ).toMatchObject({ period: "next-30", from: "2026-10-04" });
  });
  it("ignores irrelevant dates for current balances and safely normalizes URL filters", () => {
    const f = parseReportFilters({
      type: "outstanding",
      period: "custom",
      from: "bad",
      group: "sql",
      page: "Infinity",
      dues: "bad",
      q: "  name  ",
    });
    expect(f).toMatchObject({
      page: 1,
      group: "month",
      dues: "all",
      q: "name",
    });
    expect(
      parseReportFilters({ type: "__proto__", status: "constructor" }),
    ).toMatchObject({ type: "members", status: "all" });
    expect(
      parseReportFilters(
        Object.fromEntries(new URLSearchParams(reportQuery(f, { page: 2 }))),
      ),
    ).toMatchObject({ page: 2, q: "name" });
  });
});
describe("report CSV", () => {
  it("neutralizes formulas, phone prefixes and leading whitespace while retaining numbers", () => {
    for (const value of [
      "=SUM(A1)",
      "+919876543210",
      "-formula",
      "@cmd",
      "  =formula",
      "\tformula",
      "\rformula",
    ])
      expect(reportCsvCell(value)).toBe(`"'${value}"`);
    expect(reportCsvCell("-120.50", true)).toBe('"-120.50"');
    expect(reportCsvCell('A, "B"\nC')).toBe('"A, ""B""\nC"');
  });
});
