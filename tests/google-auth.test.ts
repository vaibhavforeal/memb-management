import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { hashPassword } from "better-auth/crypto";

vi.mock("../src/lib/db", () => ({ db: {} }));
vi.mock("../src/lib/mail", () => ({ sendEmail: vi.fn() }));

const baseURL = "http://localhost:3019";
const testEmail = "invited@example.test";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup(configured = true) {
  vi.resetModules();
  vi.stubEnv("BETTER_AUTH_URL", baseURL);
  vi.stubEnv(
    "GOOGLE_CLIENT_ID",
    configured ? "test-client.apps.googleusercontent.com" : "",
  );
  vi.stubEnv(
    "GOOGLE_CLIENT_SECRET",
    configured ? "test-google-client-secret" : "",
  );
  const { auth: appAuth } = await import("../src/lib/auth");
  const data: MemoryDB = {
    user: [],
    account: [],
    session: [],
    verification: [],
  };
  const auth = betterAuth({
    ...appAuth.options,
    database: memoryAdapter(data),
    baseURL,
    secret: randomBytes(32).toString("hex"),
    rateLimit: { enabled: false },
    plugins: [],
    logger: { disabled: true },
  });
  return { auth, data, context: await auth.$context };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function addUser(env: Setup, emailVerified = true) {
  const user = await env.context.internalAdapter.createUser(
    {
      name: "Invited owner",
      email: testEmail,
      emailVerified,
      platformAdmin: false,
    },
    { method: "email-password" },
  );
  await env.context.internalAdapter.createAccount({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: await hashPassword("Local-test-password-2026!"),
  });
  return user;
}

async function begin(env: Setup, requestSignUp = false) {
  return env.auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: baseURL },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/dashboard",
        newUserCallbackURL: "/onboarding",
        errorCallbackURL: "/login?auth_error=google",
        disableRedirect: true,
        requestSignUp,
      }),
    }),
  );
}

// Only Google's external token exchange/profile response is simulated. The
// application's actual Better Auth settings, state checks, linking, and sessions run.
async function callback(
  env: Setup,
  {
    email = testEmail,
    verified = true,
    requestSignUp = false,
    dropStateCookie = false,
    denied = false,
  } = {},
) {
  const provider = env.context.socialProviders.find(
    (entry) => entry.id === "google",
  )!;
  vi.spyOn(provider, "validateAuthorizationCode").mockResolvedValue({
    accessToken: "simulated-google-access-token",
    scopes: ["openid", "email", "profile"],
  });
  vi.spyOn(provider, "getUserInfo").mockResolvedValue({
    user: {
      name: "Google name",
      email,
      emailVerified: verified,
    },
    data: { sub: "google-subject-123", email, email_verified: verified },
  });
  const start = await begin(env, requestSignUp);
  expect(start.status).toBe(200);
  const authorization = new URL((await start.json()).url);
  const cookie = start.headers
    .getSetCookie()
    .map((item) => item.split(";")[0])
    .join("; ");
  const params = new URLSearchParams({
    state: authorization.searchParams.get("state")!,
  });
  params.set(
    denied ? "error" : "code",
    denied ? "access_denied" : "simulated-code",
  );
  return env.auth.handler(
    new Request(`${baseURL}/api/auth/callback/google?${params}`, {
      headers: dropStateCookie ? {} : { cookie },
    }),
  );
}

describe("Google sign-in alongside existing accounts", () => {
  it("keeps Google unavailable until both server credentials are configured", async () => {
    const env = await setup(false);
    const response = await begin(env);
    expect(response.status).toBe(404);
    expect(env.data.session).toHaveLength(0);
  });

  it("starts Google with the correct redirect URI, minimal scopes, and PKCE", async () => {
    const env = await setup();
    const response = await begin(env);
    expect(response.status).toBe(200);
    const body = await response.json();
    const url = new URL(body.url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe(
      "test-client.apps.googleusercontent.com",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${baseURL}/api/auth/callback/google`,
    );
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
      "email",
      "openid",
      "profile",
    ]);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("access_type")).toBe("online");
    expect(JSON.stringify(body)).not.toContain("test-google-client-secret");
  });

  it("links the same verified email without replacing its account or password", async () => {
    const env = await setup();
    const user = await addUser(env);
    const response = await callback(env);
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location")!, baseURL).pathname).toBe(
      "/dashboard",
    );
    expect(env.data.user).toHaveLength(1);
    expect(env.data.user[0]).toMatchObject({
      id: user.id,
      name: "Invited owner",
      platformAdmin: false,
    });
    expect(env.data.session[0].userId).toBe(user.id);
    const googleAccount = env.data.account.find(
      (entry) => entry.providerId === "google",
    );
    expect(googleAccount?.userId).toBe(user.id);
    expect(googleAccount?.accessToken).toBeTruthy();
    expect(googleAccount?.accessToken).not.toBe(
      "simulated-google-access-token",
    );
    const passwordSignIn = await env.auth.api.signInEmail({
      body: { email: testEmail, password: "Local-test-password-2026!" },
    });
    expect(passwordSignIn.user.id).toBe(user.id);
  });

  it("creates a new Google account and sends it to workspace setup", async () => {
    const env = await setup();
    const response = await callback(env, { requestSignUp: true });
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location")!, baseURL).pathname).toBe(
      "/onboarding",
    );
    expect(env.data.user).toHaveLength(1);
    expect(env.data.user[0]).toMatchObject({
      email: testEmail,
      emailVerified: true,
      platformAdmin: false,
    });
    expect(env.data.account).toHaveLength(1);
    expect(env.data.account[0].providerId).toBe("google");
    expect(env.data.account[0].password).toBeFalsy();
    expect(env.data.session).toHaveLength(1);
    const returning = await callback(env);
    expect(new URL(returning.headers.get("location")!, baseURL).pathname).toBe(
      "/dashboard",
    );
    expect(env.data.user).toHaveLength(1);
    expect(env.data.account).toHaveLength(1);
  });

  it("does not create an account from Google sign-in without a sign-up request", async () => {
    const env = await setup();
    const response = await callback(env);
    const location = new URL(response.headers.get("location")!, baseURL);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("signup_disabled");
    expect(env.data.user).toHaveLength(0);
    expect(env.data.account).toHaveLength(0);
    expect(env.data.session).toHaveLength(0);
  });

  it("keeps raw password signup disabled", async () => {
    const env = await setup();
    const response = await env.auth.handler(
      new Request(`${baseURL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: baseURL },
        body: JSON.stringify({
          name: "Example",
          email: testEmail,
          password: "Local-test-password-2026!",
          platformAdmin: true,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe(
      "EMAIL_PASSWORD_SIGN_UP_DISABLED",
    );
    expect(env.data.user).toHaveLength(0);
  });

  it("requires Google's email verification before linking", async () => {
    const env = await setup();
    await addUser(env);
    const response = await callback(env, { verified: false });
    expect(response.headers.get("location")).toContain("account_not_linked");
    expect(env.data.account).toHaveLength(1);
    expect(env.data.session).toHaveLength(0);
  });

  it("rejects linking to a local account whose email has not been verified", async () => {
    const env = await setup();
    await addUser(env, false);
    const response = await callback(env);
    expect(response.headers.get("location")).toContain("account_not_linked");
    expect(env.data.account).toHaveLength(1);
    expect(env.data.session).toHaveLength(0);
  });

  it("rejects a callback without its browser state cookie", async () => {
    const env = await setup();
    await addUser(env);
    const response = await callback(env, { dropStateCookie: true });
    expect(new URL(response.headers.get("location")!, baseURL).pathname).toBe(
      "/login",
    );
    expect(env.data.account).toHaveLength(1);
    expect(env.data.session).toHaveLength(0);
  });

  it("returns a cancelled Google sign-in to the login page", async () => {
    const env = await setup();
    const response = await callback(env, { denied: true });
    expect(response.headers.get("location")).toContain("access_denied");
    expect(new URL(response.headers.get("location")!, baseURL).pathname).toBe(
      "/login",
    );
    expect(env.data.session).toHaveLength(0);
  });
});
