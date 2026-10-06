import { describe, expect, it } from "vitest";
import { safeNext } from "../src/lib/safe-next";

describe("safeNext", () => {
  it.each([
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/foo\\bar",
    "/foo\nbar",
    "/foo\tbar",
    "/\u0000x",
    "javascript:alert(1)",
    "evil.com",
    "///evil.com",
  ])("rejects %j", (value) => {
    expect(safeNext(value)).toBe("/dashboard");
  });

  it.each(["/members?tab=x", "/dashboard", "/support/start?grant=abc", "/"])(
    "keeps %j",
    (value) => {
      expect(safeNext(value)).toBe(value);
    },
  );

  it("falls back for undefined and empty", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeNext("//evil.com", "/home")).toBe("/home");
  });

  it("falls back for non-string input such as repeated query params", () => {
    expect(safeNext(["/a", "/b"] as unknown as string)).toBe("/dashboard");
  });
});
