import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { hashPassword } from "better-auth/crypto";
import { betterAuthBaseURL, onMainSite } from "../src/lib/auth-base-url";
import { sendEmail } from "../src/lib/mail";

vi.mock("../src/lib/db", () => ({ db: {} }));
vi.mock("../src/lib/mail", () => ({ sendEmail: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

describe("betterAuthBaseURL", () => {
  it("stays a plain string when the console is not configured", () => {
    expect(
      betterAuthBaseURL({ baseUrl: "https://membrr.pro", consoleUrl: "" }),
    ).toBe("https://membrr.pro");
    expect(betterAuthBaseURL({})).toBeUndefined();
  });

  it("allows the console host and falls back to the main URL otherwise", () => {
    expect(
      betterAuthBaseURL({
        baseUrl: "https://membrr.pro",
        consoleUrl: "https://console.membrr.pro",
      }),
    ).toEqual({
      allowedHosts: ["console.membrr.pro"],
      fallback: "https://membrr.pro",
      protocol: "https",
    });
  });

  it("normalises the console origin the way a browser sends it", () => {
    expect(
      betterAuthBaseURL({
        baseUrl: "https://membrr.pro",
        consoleUrl: "https://Console.Membrr.pro:443/",
      }),
    ).toMatchObject({ allowedHosts: ["console.membrr.pro"] });
  });

  it("keeps the dev port", () => {
    expect(
      betterAuthBaseURL({
        baseUrl: "http://localhost:3000",
        consoleUrl: "http://console.localhost:3000",
      }),
    ).toEqual({
      allowedHosts: ["console.localhost:3000"],
      fallback: "http://localhost:3000",
      protocol: "http",
    });
  });

  it("takes the protocol from the console URL, not the main URL", () => {
    expect(
      betterAuthBaseURL({
        baseUrl: "http://localhost:3000",
        consoleUrl: "https://console.example.test",
      }),
    ).toMatchObject({ protocol: "https" });
  });

  it("does not go dynamic without a main URL to fall back to", () => {
    expect(
      betterAuthBaseURL({ consoleUrl: "https://console.membrr.pro" }),
    ).toBeUndefined();
  });

  it("ignores a console URL that does not parse", () => {
    expect(
      betterAuthBaseURL({
        baseUrl: "https://membrr.pro",
        consoleUrl: "console.membrr.pro",
      }),
    ).toBe("https://membrr.pro");
    // Parses, but as scheme "console.localhost:" with an empty host.
    expect(
      betterAuthBaseURL({
        baseUrl: "http://localhost:3000",
        consoleUrl: "console.localhost:3000",
      }),
    ).toBe("http://localhost:3000");
  });
});

describe("Google OAuth start with the app's real auth config", () => {
  async function startGoogle(host: string) {
    vi.resetModules();
    vi.stubEnv("BETTER_AUTH_URL", "https://membrr.pro");
    vi.stubEnv("CONSOLE_URL", "https://console.membrr.pro");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
    const { auth: appAuth } = await import("../src/lib/auth");
    const auth = betterAuth({
      ...appAuth.options,
      database: memoryAdapter({
        user: [],
        account: [],
        session: [],
        verification: [],
      }),
      secret: randomBytes(32).toString("hex"),
      rateLimit: { enabled: false },
      plugins: [],
      logger: { disabled: true },
    });
    const response = await auth.handler(
      new Request(`https://${host}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: `https://${host}`,
        },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "/",
          disableRedirect: true,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const url = new URL((await response.json()).url);
    return { redirectUri: url.searchParams.get("redirect_uri") };
  }

  it("returns to the console host when the flow starts there", async () => {
    const { redirectUri } = await startGoogle("console.membrr.pro");
    expect(redirectUri).toBe(
      "https://console.membrr.pro/api/auth/callback/google",
    );
  });

  it("still returns to the main host for the main site", async () => {
    const { redirectUri } = await startGoogle("membrr.pro");
    expect(redirectUri).toBe("https://membrr.pro/api/auth/callback/google");
  });

  it("does not trust an arbitrary host", async () => {
    const { redirectUri } = await startGoogle("evil.example");
    expect(redirectUri).toBe("https://membrr.pro/api/auth/callback/google");
  });
});

describe("onMainSite", () => {
  it("moves a link to the main origin, keeping path and query", () => {
    expect(
      onMainSite(
        "https://console.membrr.pro/api/auth/reset-password/abc?callbackURL=%2Freset-password",
        "https://membrr.pro",
      ),
    ).toBe(
      "https://membrr.pro/api/auth/reset-password/abc?callbackURL=%2Freset-password",
    );
  });

  it("leaves the link alone without a valid main URL", () => {
    const url = "https://console.membrr.pro/api/auth/reset-password/abc";
    expect(onMainSite(url, undefined)).toBe(url);
    expect(onMainSite(url, "not a url")).toBe(url);
  });
});

describe("password reset requested on the console host", () => {
  it("emails a link on the main site", async () => {
    vi.resetModules();
    vi.mocked(sendEmail).mockClear();
    vi.stubEnv("BETTER_AUTH_URL", "https://membrr.pro");
    vi.stubEnv("CONSOLE_URL", "https://console.membrr.pro");
    const { auth: appAuth } = await import("../src/lib/auth");
    const { sendEmail: mailer } = await import("../src/lib/mail");
    const auth = betterAuth({
      ...appAuth.options,
      database: memoryAdapter({
        user: [],
        account: [],
        session: [],
        verification: [],
      }),
      secret: randomBytes(32).toString("hex"),
      rateLimit: { enabled: false },
      plugins: [],
      logger: { disabled: true },
    });
    const context = await auth.$context;
    const user = await context.internalAdapter.createUser(
      { name: "Admin", email: "admin@example.test", emailVerified: true },
      { method: "email-password" },
    );
    await context.internalAdapter.createAccount({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword("Local-test-password-2026!"),
    });
    const response = await auth.handler(
      new Request(
        "https://console.membrr.pro/api/auth/request-password-reset",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            origin: "https://console.membrr.pro",
          },
          body: JSON.stringify({
            email: "admin@example.test",
            redirectTo: "/reset-password",
          }),
        },
      ),
    );
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(mailer).toHaveBeenCalledTimes(1));
    const text = vi.mocked(mailer).mock.calls[0][2];
    expect(text).toContain("https://membrr.pro/api/auth/reset-password/");
    expect(text).not.toContain("console.membrr.pro");
  });
});
