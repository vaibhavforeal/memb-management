import { describe, expect, it } from "vitest";
import { reportCell } from "../src/lib/reports";

describe("report CSV cells", () => {
  it("exports timestamps as their IST day and calendar dates unchanged", () => {
    // 20:00 UTC on 4 Oct is 01:30 IST on 5 Oct.
    const row = {
      id: "1",
      joined: new Date("2026-10-04T20:00:00Z"),
      due: new Date("2026-10-04T00:00:00Z"),
    };
    expect(
      reportCell(row, { key: "joined", label: "", kind: "datetime" }, true),
    ).toBe("2026-10-05");
    expect(reportCell(row, { key: "due", label: "", kind: "date" }, true)).toBe(
      "2026-10-04",
    );
  });
});
