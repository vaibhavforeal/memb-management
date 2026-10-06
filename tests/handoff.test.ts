import { describe, expect, it } from "vitest";
import {
  forbiddenPage,
  loginRedirectPath,
  supportGrantValid,
} from "../src/lib/handoff";

const now = new Date("2026-10-06T12:00:00Z");
const grant = {
  actorId: "admin-1",
  expiresAt: new Date("2026-10-06T12:30:00Z"),
};

describe("supportGrantValid", () => {
  it("accepts an unexpired grant owned by the signed-in platform admin", () => {
    expect(supportGrantValid(grant, "admin-1", true, now)).toBe(true);
  });
  it("rejects a missing grant", () => {
    expect(supportGrantValid(null, "admin-1", true, now)).toBe(false);
    expect(supportGrantValid(undefined, "admin-1", true, now)).toBe(false);
  });
  it("rejects a grant belonging to another user", () => {
    expect(supportGrantValid(grant, "admin-2", true, now)).toBe(false);
  });
  it("rejects an expired grant, including exactly at expiry", () => {
    expect(supportGrantValid(grant, "admin-1", true, grant.expiresAt)).toBe(
      false,
    );
    expect(
      supportGrantValid(
        grant,
        "admin-1",
        true,
        new Date("2026-10-06T13:00:00Z"),
      ),
    ).toBe(false);
  });
  it("rejects a user who is not a platform admin", () => {
    expect(supportGrantValid(grant, "admin-1", false, now)).toBe(false);
    expect(supportGrantValid(grant, "admin-1", null, now)).toBe(false);
    expect(supportGrantValid(grant, "admin-1", undefined, now)).toBe(false);
  });
});

describe("loginRedirectPath", () => {
  it("encodes path and query into next", () => {
    expect(loginRedirectPath("/support/start", "?grant=abc")).toBe(
      "/login?next=%2Fsupport%2Fstart%3Fgrant%3Dabc",
    );
    expect(loginRedirectPath("/open/b1", "")).toBe("/login?next=%2Fopen%2Fb1");
  });
});

describe("forbiddenPage", () => {
  it("returns a plain 403 HTML page with a dashboard link", async () => {
    const res = forbiddenPage("This support link is invalid or has expired.");
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("This support link is invalid or has expired.");
    expect(body).toContain('href="/dashboard"');
  });
});
