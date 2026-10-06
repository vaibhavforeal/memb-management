import { test, expect } from "@playwright/test";
import { db } from "../src/lib/db";
import { money } from "../src/lib/domain";
import { ensureLocalTest } from "../scripts/test-support";
import { signIn } from "./sign-in";
import { SIGNUP_MONTHLY_FEE_PAISE } from "../src/lib/workspace-access";

test.beforeAll(() => ensureLocalTest());
test.afterAll(() => db.$disconnect());

test("signed-out visitor sees the landing page and the real price", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A little less admin.",
  );
  await expect(
    page.getByRole("link", { name: "Start free trial" }).first(),
  ).toHaveAttribute("href", "/signup");
  const fee = money(SIGNUP_MONTHLY_FEE_PAISE);
  await expect(page.locator("#pricing")).toContainText(fee);
  await page.goto("/signup");
  await expect(page.getByText(`${fee} per month`)).toBeVisible();
});

test("an invalid session cookie is treated as signed out", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: "not-a-real-token.signature",
      url: "http://localhost:3000",
    },
  ]);
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("link", { name: "Start free trial" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to dashboard" })).toHaveCount(
    0,
  );
});

test("signed-in owner sees Go to dashboard instead of signup links", async ({
  page,
}) => {
  await signIn(page, "owner@membrr.local");
  await page.waitForURL("**/dashboard");
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Go to dashboard" }).first(),
  ).toHaveAttribute("href", "/dashboard");
  await expect(
    page.getByRole("link", { name: "Start free trial" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign up" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
});

test("landing page fits a 390px phone without horizontal scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(
    page.getByRole("link", { name: "Start free trial" }).first(),
  ).toBeVisible();
});
