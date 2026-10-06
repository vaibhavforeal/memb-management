import { describe, expect, it } from "vitest";
import { consoleRoute, isConsoleHost } from "../src/lib/console/route";

const env = {
  consoleHost: "console.membrr.pro",
  consoleUrl: "https://console.membrr.pro",
};
const CH = "console.membrr.pro";

describe("isConsoleHost", () => {
  it("matches case-insensitively, exact", () => {
    expect(isConsoleHost("Console.Membrr.PRO", CH)).toBe(true);
    expect(isConsoleHost("console.membrr.pro.evil.com", CH)).toBe(false);
    expect(isConsoleHost("evil.console.membrr.pro", CH)).toBe(false);
    expect(
      isConsoleHost("console.localhost:3000", "console.localhost:3000"),
    ).toBe(true);
    expect(
      isConsoleHost("console.localhost:3001", "console.localhost:3000"),
    ).toBe(false);
  });
  it("ignores a trailing dot and the default ports 443 / 80 only", () => {
    expect(isConsoleHost("console.membrr.pro.", CH)).toBe(true);
    expect(isConsoleHost("console.membrr.pro:443", CH)).toBe(true);
    expect(isConsoleHost("console.membrr.pro:80", CH)).toBe(true);
    expect(isConsoleHost("Console.Membrr.Pro.:443", CH)).toBe(true);
    expect(isConsoleHost("console.membrr.pro", "console.membrr.pro:443")).toBe(
      true,
    );
    expect(isConsoleHost("console.membrr.pro:8443", CH)).toBe(false);
    expect(isConsoleHost("console.membrr.pro:4430", CH)).toBe(false);
    expect(isConsoleHost("console.membrr.pro..", CH)).toBe(false);
    expect(isConsoleHost("console.membrr.pro.:8080", CH)).toBe(false);
    expect(
      isConsoleHost("console.localhost:3000.", "console.localhost:3000"),
    ).toBe(false);
    expect(
      isConsoleHost("console.localhost.:3000", "console.localhost:3000"),
    ).toBe(true);
    expect(isConsoleHost("console.localhost", "console.localhost:3000")).toBe(
      false,
    );
  });
  it("is false when consoleHost unset", () => {
    expect(isConsoleHost("console.membrr.pro", undefined)).toBe(false);
    expect(isConsoleHost("", "")).toBe(false);
  });
});

describe("consoleRoute", () => {
  it("console host /api/* passes through", () => {
    expect(consoleRoute(CH, "/api/auth/sign-in/email", env)).toEqual({
      type: "next",
    });
    expect(consoleRoute(CH, "/api/health", env)).toEqual({ type: "next" });
  });
  it("console host /console/* rewrites to same path", () => {
    expect(consoleRoute(CH, "/console", env)).toEqual({
      type: "rewrite",
      pathname: "/console",
    });
    expect(consoleRoute(CH, "/console/login", env)).toEqual({
      type: "rewrite",
      pathname: "/console/login",
    });
  });
  it("console host other paths rewrite under /console", () => {
    expect(consoleRoute(CH, "/", env)).toEqual({
      type: "rewrite",
      pathname: "/console",
    });
    expect(consoleRoute(CH, "/workspaces/abc", env)).toEqual({
      type: "rewrite",
      pathname: "/console/workspaces/abc",
    });
    expect(consoleRoute(CH, "/login", env)).toEqual({
      type: "rewrite",
      pathname: "/console/login",
    });
  });
  it("default port and trailing dot route like the canonical host", () => {
    for (const host of ["console.membrr.pro:443", "console.membrr.pro."]) {
      expect(consoleRoute(host, "/workspaces", env)).toEqual({
        type: "rewrite",
        pathname: "/console/workspaces",
      });
    }
  });
  it("mixed-case host matches", () => {
    expect(consoleRoute("CONSOLE.membrr.Pro", "/", env)).toEqual({
      type: "rewrite",
      pathname: "/console",
    });
  });
  it("lookalike host is treated as another host", () => {
    expect(consoleRoute("console.membrr.pro.evil.com", "/", env)).toEqual({
      type: "next",
    });
    expect(
      consoleRoute("console.membrr.pro.evil.com", "/console", env),
    ).toEqual({ type: "not-found" });
  });
  it("other host /console and /console/* not-found", () => {
    expect(consoleRoute("membrr.pro", "/console", env)).toEqual({
      type: "not-found",
    });
    expect(consoleRoute("membrr.pro", "/console/workspaces", env)).toEqual({
      type: "not-found",
    });
  });
  it("other host /consoles is not affected", () => {
    expect(consoleRoute("membrr.pro", "/consoles", env)).toEqual({
      type: "next",
    });
  });
  it("other host /admin and /admin/* redirect to consoleUrl", () => {
    expect(consoleRoute("membrr.pro", "/admin", env)).toEqual({
      type: "redirect",
      url: env.consoleUrl,
    });
    expect(consoleRoute("membrr.pro", "/admin/x", env)).toEqual({
      type: "redirect",
      url: env.consoleUrl,
    });
  });
  it("other host /admin not-found when consoleUrl unset", () => {
    expect(consoleRoute("membrr.pro", "/admin", { consoleHost: CH })).toEqual({
      type: "not-found",
    });
  });
  it("anything else is next", () => {
    expect(consoleRoute("membrr.pro", "/", env)).toEqual({ type: "next" });
    expect(consoleRoute("membrr.pro", "/dashboard", env)).toEqual({
      type: "next",
    });
    expect(consoleRoute("membrr.pro", "/api/health", env)).toEqual({
      type: "next",
    });
  });
  it("consoleHost unset: console and admin not-found everywhere", () => {
    expect(consoleRoute("membrr.pro", "/console", {})).toEqual({
      type: "not-found",
    });
    expect(consoleRoute("membrr.pro", "/console/x", {})).toEqual({
      type: "not-found",
    });
    expect(consoleRoute("membrr.pro", "/admin", {})).toEqual({
      type: "not-found",
    });
    expect(
      consoleRoute("membrr.pro", "/admin", { consoleUrl: env.consoleUrl }),
    ).toEqual({ type: "not-found" });
    expect(consoleRoute("membrr.pro", "/dashboard", {})).toEqual({
      type: "next",
    });
  });
});
