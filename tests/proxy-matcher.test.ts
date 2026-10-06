import { describe, expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../src/proxy";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  it("runs on page and API paths", () => {
    expect(matches("/")).toBe(true);
    expect(matches("/dashboard")).toBe(true);
    expect(matches("/admin")).toBe(true);
    expect(matches("/workspaces/abc")).toBe(true);
    expect(matches("/api/auth/sign-in/email")).toBe(true);
  });
  it("skips Next internals and static files", () => {
    expect(matches("/_next/static/chunks/app.js")).toBe(false);
    expect(matches("/_next/image")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
    expect(matches("/logo.png")).toBe(false);
  });
  it("always runs on /console paths, even with a dot", () => {
    expect(matches("/console")).toBe(true);
    expect(matches("/console/workspaces")).toBe(true);
    expect(matches("/console/workspaces/a.b")).toBe(true);
    expect(matches("/console/x.css")).toBe(true);
  });
});
