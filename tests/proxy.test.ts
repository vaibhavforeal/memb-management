import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

const REWRITE = "x-middleware-rewrite";

describe("proxy rewrites", () => {
  beforeEach(() => {
    process.env.CONSOLE_HOST = "console.membrr.pro";
    process.env.CONSOLE_URL = "https://console.membrr.pro";
  });
  afterEach(() => {
    delete process.env.CONSOLE_HOST;
    delete process.env.CONSOLE_URL;
  });

  it("never builds a rewrite target from the Host header (main host)", () => {
    const res = proxy(
      new NextRequest("http://127.0.0.1:3000/console?x=1", {
        headers: { host: "evil.example" },
      }),
    );
    const target = new URL(res.headers.get(REWRITE)!);
    expect(target.hostname).not.toBe("evil.example");
    expect(target.pathname).toBe("/_not-found-console");
    expect(target.search).toBe("");
  });

  it("console host rewrites to /console/x on the server origin", () => {
    const res = proxy(
      new NextRequest("http://127.0.0.1:3000/workspaces?page=2", {
        headers: { host: "console.membrr.pro" },
      }),
    );
    const target = new URL(res.headers.get(REWRITE)!);
    expect(target.hostname).not.toBe("console.membrr.pro");
    expect(target.pathname).toBe("/console/workspaces");
    expect(target.search).toBe("?page=2");
  });
});
