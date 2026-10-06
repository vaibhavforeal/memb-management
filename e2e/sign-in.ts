import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "MembrrDemo!2026";

// Better Auth allows 3 sign-ins per 10 seconds per client. Specs that sign in
// several users back to back wait out the window instead of failing on 429.
// `origin` (e.g. "http://console.localhost:3000") signs in on another host's
// /login; by default the form on Playwright's baseURL is used.
export async function signIn(
  page: Page,
  email: string,
  password = DEMO_PASSWORD,
  attempts = 4,
  origin = "",
) {
  await page.goto(`${origin}/login`);
  await submitLogin(page, email, password, attempts);
}

/** Fills and submits the login form already showing on `page` (e.g. after a `/login?next=` redirect). */
export async function submitLogin(
  page: Page,
  email: string,
  password = DEMO_PASSWORD,
  attempts = 4,
) {
  for (let attempt = 1; ; attempt++) {
    await page.getByRole("textbox", { name: "Email address" }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-in/email") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const result = await response;
    if (result.status() === 429 && attempt < attempts) {
      const seconds = Number(result.headers()["x-retry-after"]) || 10;
      await page.waitForTimeout((seconds + 1) * 1000);
      await page.reload();
      continue;
    }
    expect(result.status(), `sign-in for ${email}`).toBe(200);
    return;
  }
}
