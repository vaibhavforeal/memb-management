import { describe, expect, it } from "vitest";
import {
  missingDatabaseColumns,
  requiredDatabaseColumns,
} from "../src/lib/database-schema";

describe("deployment database readiness", () => {
  it("accepts the complete schema and additional database columns", () => {
    expect(
      missingDatabaseColumns([
        ...requiredDatabaseColumns,
        { table_name: "Other", column_name: "extra" },
      ]),
    ).toEqual([]);
  });

  it("detects the production mismatch even though the database can connect", () => {
    const oldColumns = requiredDatabaseColumns.filter(
      (column) =>
        !["BusinessLogo", "MemberPhoto"].includes(column.table_name) &&
        !(
          column.table_name === "Business" &&
          ["phone", "address"].includes(column.column_name)
        ) &&
        !(column.table_name === "Plan" && column.column_name === "taxRateBps"),
    );
    const missing = missingDatabaseColumns(oldColumns).map(
      (column) => `${column.table_name}.${column.column_name}`,
    );
    expect(missing).toContain("BusinessLogo.businessId");
    expect(missing).toContain("MemberPhoto.memberId");
    expect(missing).toContain("Business.phone");
    expect(missing).toContain("Business.address");
    expect(missing).toContain("Plan.taxRateBps");
    expect(missing).not.toContain("Member.name");
  });

  it("rejects an empty schema instead of giving a false healthy response", () => {
    expect(missingDatabaseColumns([])).toHaveLength(
      requiredDatabaseColumns.length,
    );
    expect(requiredDatabaseColumns.length).toBeGreaterThan(0);
    expect(requiredDatabaseColumns).not.toContainEqual({
      table_name: "Business",
      column_name: "members",
    });
  });
});
