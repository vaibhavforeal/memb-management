import { describe, expect, it } from "vitest";
import { csvCell, ordersCsv, rupees } from "../src/lib/console/csv";

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(42)).toBe("42");
  });
  it("renders null as empty", () => {
    expect(csvCell(null)).toBe("");
  });
  it("quotes commas, newlines and CR", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("a\rb")).toBe('"a\rb"');
  });
  it("doubles quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])(
    "neutralises formula prefix %j",
    (value) => {
      const out = csvCell(value);
      expect(out.replace(/^"/, "").startsWith("'")).toBe(true);
    },
  );
  it("prefixes and quotes when both apply", () => {
    expect(csvCell("=A,B")).toBe(`"'=A,B"`);
  });
  it("does not prefix a mid-string symbol", () => {
    expect(csvCell("a=b")).toBe("a=b");
  });
});

describe("rupees", () => {
  it("formats paise without floating error", () => {
    expect(rupees(49_900)).toBe("499.00");
    expect(rupees(5)).toBe("0.05");
    expect(rupees(123_456_789)).toBe("1234567.89");
    expect(rupees(0)).toBe("0.00");
  });
});

describe("ordersCsv", () => {
  const header =
    "Created,Workspace,Amount (INR),Status,Period start,Period end,Razorpay order,Razorpay payment";
  it("emits the header for no rows", () => {
    expect(ordersCsv([])).toBe(`${header}\r\n`);
  });
  it("renders paid and pending rows, escaping workspace names", () => {
    const csv = ordersCsv([
      {
        createdAt: new Date("2026-10-01T05:30:00Z"),
        workspace: '=Iron, "Gym"',
        amountPaise: 49_900,
        paidAt: new Date("2026-10-01T06:00:00Z"),
        periodStart: new Date("2026-10-01T00:00:00Z"),
        periodEnd: new Date("2026-10-31T00:00:00Z"),
        razorpayOrderId: "order_1",
        razorpayPaymentId: "pay_1",
      },
      {
        createdAt: new Date("2026-10-02T05:30:00Z"),
        workspace: "Plain",
        amountPaise: 100,
        paidAt: null,
        periodStart: null,
        periodEnd: null,
        razorpayOrderId: "order_2",
        razorpayPaymentId: null,
      },
    ]).split("\r\n");
    expect(csv[0]).toBe(header);
    expect(csv[1]).toContain(`"'=Iron, ""Gym"""`);
    expect(csv[1]).toContain(
      ",499.00,Paid,2026-10-01,2026-10-31,order_1,pay_1",
    );
    expect(csv[2]).toMatch(/,Plain,1\.00,Pending,,,order_2,$/);
  });
});
