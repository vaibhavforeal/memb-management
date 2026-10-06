import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { test, expect, type Page } from "@playwright/test";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { completeGoogleSignup } from "../src/lib/signup";
import { ensureLocalTest } from "../scripts/test-support";

test.beforeAll(() => ensureLocalTest());
test.afterAll(() => db.$disconnect());
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

async function googleSignup(page: Page, email: string, verified = true) {
  // Provider simulation stays inside this local-only test process. The normal
  // app server receives a real signed session and renders the setup flow.
  const testAuth = betterAuth({
    ...auth.options,
    baseURL,
    socialProviders: {
      google: { clientId: "test-client", clientSecret: "test-secret" },
    },
    rateLimit: { enabled: false },
    plugins: [],
    logger: { disabled: true },
  });
  const provider = (await testAuth.$context).socialProviders.find(
    (entry) => entry.id === "google",
  )!;
  provider.validateAuthorizationCode = async () => ({
    accessToken: "fixture-access-token",
    scopes: ["openid", "email", "profile"],
  });
  provider.getUserInfo = async () => ({
    user: { name: "Google test owner", email, emailVerified: verified },
    data: { sub: email, email, email_verified: verified },
  });
  const response = await testAuth.handler(
    new Request(`${baseURL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: baseURL },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/dashboard",
        newUserCallbackURL: "/onboarding",
        disableRedirect: true,
      }),
    }),
  );
  expect(response.status).toBe(200);
  const providerURL = new URL((await response.json()).url);
  expect(providerURL.origin).toBe("https://accounts.google.com");
  const query = new URLSearchParams({
    state: providerURL.searchParams.get("state")!,
    code: "fixture-code",
  });
  const callback = await testAuth.handler(
    new Request(`${baseURL}/api/auth/callback/google?${query}`, {
      headers: {
        cookie: response.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; "),
      },
    }),
  );
  expect(callback.status).toBe(302);
  for (const raw of callback.headers.getSetCookie()) {
    const [pair, ...attributes] = raw.split(";");
    if (attributes.some((value) => value.trim().toLowerCase() === "max-age=0"))
      continue;
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (value)
      await page
        .context()
        .addCookies([
          { name, value, url: baseURL, httpOnly: true, sameSite: "Lax" },
        ]);
  }
  await page.goto(new URL(callback.headers.get("location")!, baseURL).href);
}

test("Google signup creates one trial workspace and returning users retain access", async ({
  page,
}) => {
  const email = `google-${randomUUID()}@example.test`;
  const businessName = `itest-google-${randomUUID()}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await googleSignup(page, email);
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("textbox")).toHaveCount(2);
    await page.getByLabel("Workspace name").fill(businessName);
    await page.getByLabel("City").fill("Bengaluru");
    await page.screenshot({ path: "artifacts/google-workspace-setup.png" });
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await page.waitForURL("**/dashboard");
    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { accounts: true, access: true },
    });
    const business = await db.business.findUniqueOrThrow({
      where: { id: user.access[0].businessId },
      include: { invitations: true, branches: true },
    });
    expect(user.platformAdmin).toBe(false);
    expect(user.emailVerified).toBe(true);
    expect(user.accounts.map((account) => account.providerId)).toEqual([
      "google",
    ]);
    expect(user.access[0].role).toBe("OWNER");
    expect(business.trialEndsAt!.getTime() - user.createdAt.getTime()).toBe(
      72 * 60 * 60 * 1000,
    );
    expect(business.monthlyFeePaise).toBe(49900);
    expect(business.invitations).toHaveLength(0);
    expect(business.branches).toHaveLength(1);
    await page.context().clearCookies();
    await page.unrouteAll({ behavior: "wait" });
    await googleSignup(page, email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/dashboard$/);
    const expiredAt = new Date(Date.now() - 60000);
    await db.business.update({
      where: { id: business.id },
      data: { trialEndsAt: expiredAt },
    });
    await Promise.all(
      [1, 2].map(() =>
        completeGoogleSignup(user.id, {
          businessName: "Another workspace",
          city: "Pune",
        }),
      ),
    );
    expect(await db.staffAccess.count({ where: { userId: user.id } })).toBe(1);
    expect(
      (await db.business.findUniqueOrThrow({ where: { id: business.id } }))
        .trialEndsAt,
    ).toEqual(expiredAt);
    await page.goto("/members");
    await expect(page).toHaveURL(/\/upgrade$/);
    expect(errors).toEqual([]);
  } finally {
    const user = await db.user.findUnique({
      where: { email },
      include: { access: true },
    });
    if (user) {
      for (const { businessId } of user.access) {
        await db.$transaction([
          db.auditLog.deleteMany({ where: { businessId } }),
          db.staffAccess.deleteMany({ where: { businessId, userId: user.id } }),
          db.branch.deleteMany({ where: { businessId } }),
          db.business.delete({ where: { id: businessId } }),
        ]);
      }
      await db.user.delete({ where: { id: user.id } });
    }
  }
});

test("Google setup requires a signed-in, verified Google identity", async ({
  page,
}) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/login$/);
  const email = `unverified-google-${randomUUID()}@example.test`;
  try {
    await googleSignup(page, email, false);
    await expect(page).toHaveURL(/\/access-pending$/);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    await expect(
      completeGoogleSignup(user.id, {
        businessName: "Unverified workspace",
        city: "Pune",
      }),
    ).rejects.toThrow("verified Google account");
    expect(await db.staffAccess.count({ where: { userId: user.id } })).toBe(0);
  } finally {
    const user = await db.user.findUnique({ where: { email } });
    if (user) await db.user.delete({ where: { id: user.id } });
  }
});
