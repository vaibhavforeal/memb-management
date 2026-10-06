import { describe, expect, it } from "vitest";
import { consoleAccess } from "../src/lib/console/guard";

describe("consoleAccess", () => {
  it("treats a missing user as anonymous", () => {
    expect(consoleAccess(null)).toBe("anonymous");
  });
  it("forbids users who are not platform admins", () => {
    expect(consoleAccess({ platformAdmin: false })).toBe("forbidden");
    expect(consoleAccess({})).toBe("forbidden");
  });
  it("allows platform admins", () => {
    expect(consoleAccess({ platformAdmin: true })).toBe("ok");
  });
});
