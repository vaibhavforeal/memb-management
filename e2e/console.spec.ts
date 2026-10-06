import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { ensureLocalTest } from "../scripts/test-support";
import { signIn, submitLogin } from "./sign-in";

const CONSOLE = "http://console.localhost:3000";
const MAIN = "http://localhost:3000";
const run = randomUUID();
const password = `Console-check-${randomUUID()}`;
const adminA = { id: randomUUID(), email: `console-a-${run}@example.test` };
const adminB = { id: randomUUID(), email: `console-b-${run}@example.test` };
const owner = { id: randomUUID(), email: `console-owner-${run}@example.test` };
let businessId = "";
const businessName = `itest-console-${run.slice(0, 8)}`;
const userIds = [adminA.id, adminB.id, owner.id];

async function makeUser(
  u: { id: string; email: string },
  name: string,
  platformAdmin: boolean,
) {
  await db.user.create({
    data: {
      id: u.id,
      name,
      email: u.email,
      platformAdmin,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: u.id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
}

const consoleSignIn = (page: Page, email: string) =>
  signIn(page, email, password, 4, CONSOLE);

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  ensureLocalTest();
  await makeUser(adminA, "Console Admin A", true);
  await makeUser(adminB, "Console Admin B", true);
  await makeUser(owner, "Console Owner", false);
  const business = await db.business.create({
    data: {
      name: businessName,
      slug: `itest-console-${run}`,
      city: "Test",
      remindersEnabled: false,
      trialRequired: true,
      trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      branches: { create: { name: "Main" } },
      access: { create: { userId: owner.id, role: "OWNER" } },
    },
  });
  businessId = business.id;
});

test.afterAll(async () => {
  if (businessId) {
    await db.$transaction([
      db.auditLog.deleteMany({ where: { businessId } }),
      db.supportGrant.deleteMany({ where: { businessId } }),
      db.staffAccess.deleteMany({ where: { businessId } }),
      db.branch.deleteMany({ where: { businessId } }),
      db.business.delete({ where: { id: businessId } }),
    ]);
  }
  await db.auditLog.deleteMany({
    where: {
      OR: [{ actorId: { in: userIds } }, { entityId: { in: userIds } }],
    },
  });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

test("non-admin owner is refused on the console", async ({ page }) => {
  await consoleSignIn(page, owner.email);
  await page.waitForURL(/\/login\?error=not_admin/);
  expect(new URL(page.url()).origin).toBe(CONSOLE);
  await expect(
    page.getByText("This account doesn't have console access."),
  ).toBeVisible();
  await page.goto(`${CONSOLE}/workspaces`);
  await expect(page).toHaveURL(`${CONSOLE}/login`);
});

test("admin sees every console page", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await consoleSignIn(page, adminA.email);
  await page.waitForURL(`${CONSOLE}/`);
  const nav = page.locator("aside nav");
  for (const label of ["Overview", "Workspaces", "Revenue", "Users", "Audit"])
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await nav.getByRole("link", { name: "Workspaces" }).click();
  await page.waitForURL(`${CONSOLE}/workspaces`);
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
  await page.getByPlaceholder(/Search name/).fill(businessName);
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("link", { name: businessName }).click();
  await page.waitForURL(`${CONSOLE}/workspaces/${businessId}`);
  await expect(page.getByRole("heading", { name: businessName })).toBeVisible();
  await expect(page.getByText(owner.email).first()).toBeVisible();

  await nav.getByRole("link", { name: "Revenue" }).click();
  await page.waitForURL(`${CONSOLE}/revenue`);
  await expect(page.getByRole("heading", { name: "Revenue" })).toBeVisible();

  await nav.getByRole("link", { name: "Users" }).click();
  await page.waitForURL(`${CONSOLE}/users`);
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await page.getByPlaceholder(/Search name or email/).fill(owner.email);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/users\?/);
  await page.getByRole("link", { name: "Console Owner" }).click();
  await page.waitForURL(`${CONSOLE}/users/${owner.id}`);
  await expect(
    page.getByRole("heading", { name: "Console Owner" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: businessName })).toBeVisible();

  await nav.getByRole("link", { name: "Audit" }).click();
  await page.waitForURL(`${CONSOLE}/audit`);
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("extending a trial updates the date and appears in the audit log", async ({
  page,
}) => {
  const before = await db.business.findUniqueOrThrow({
    where: { id: businessId },
  });
  await consoleSignIn(page, adminA.email);
  await page.waitForURL(`${CONSOLE}/`);
  await page.goto(`${CONSOLE}/workspaces/${businessId}`);
  await page.getByRole("button", { name: "Extend trial", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Days (1–90)").fill("7");
  await dialog
    .getByRole("button", { name: "Extend trial", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Trial extended to");

  const after = await db.business.findUniqueOrThrow({
    where: { id: businessId },
  });
  expect(after.trialEndsAt!.getTime() - before.trialEndsAt!.getTime()).toBe(
    7 * 24 * 60 * 60 * 1000,
  );
  const row = await db.auditLog.findFirstOrThrow({
    where: { businessId, action: "CONSOLE_TRIAL_EXTENDED" },
  });
  expect(row.actorId).toBe(adminA.id);

  await page.goto(`${CONSOLE}/audit?business=${businessId}`);
  await expect(
    page.getByRole("cell", { name: "CONSOLE_TRIAL_EXTENDED" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: adminA.email })).toBeVisible();
});

test("an admin cannot revoke their own admin access", async ({ page }) => {
  await consoleSignIn(page, adminA.email);
  await page.waitForURL(`${CONSOLE}/`);

  // Own page: the Revoke button is not offered.
  await page.goto(`${CONSOLE}/users/${adminA.id}`);
  await expect(
    page.getByRole("heading", { name: "Console Admin A" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke admin" })).toHaveCount(
    0,
  );

  // Another admin's page offers it. Forge the target to our own id: the
  // server action must still refuse.
  await page.goto(`${CONSOLE}/users/${adminB.id}`);
  const revoke = page.locator("form").filter({
    has: page.getByRole("button", { name: "Revoke admin" }),
  });
  await revoke.locator('input[name="userId"]').evaluate((input, id) => {
    (input as HTMLInputElement).value = id;
  }, adminA.id);
  await revoke.getByRole("button", { name: "Revoke admin" }).click();
  await expect(revoke.getByRole("alert")).toHaveText(
    "You cannot revoke your own platform admin access.",
  );
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: adminA.id } }))
      .platformAdmin,
  ).toBe(true);

  // Revoking someone else works.
  await page.goto(`${CONSOLE}/users/${adminB.id}`);
  const real = page.locator("form").filter({
    has: page.getByRole("button", { name: "Revoke admin" }),
  });
  await real.getByRole("button", { name: "Revoke admin" }).click();
  // The page revalidates and swaps Revoke for Grant.
  await expect(page.getByRole("button", { name: "Grant admin" })).toBeVisible();
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: adminB.id } }))
      .platformAdmin,
  ).toBe(false);
});

test("the main host hides /console and sends /admin to the console", async ({
  request,
}) => {
  expect((await request.get(`${MAIN}/console`)).status()).toBe(404);
  expect((await request.get(`${MAIN}/console/workspaces`)).status()).toBe(404);
  const admin = await request.get(`${MAIN}/admin`, { maxRedirects: 0 });
  expect([307, 308]).toContain(admin.status());
  expect(admin.headers()["location"]).toContain(CONSOLE);
});

test("support access hands off to the workspace dashboard with the banner", async ({
  page,
}) => {
  await consoleSignIn(page, adminA.email);
  await page.waitForURL(`${CONSOLE}/`);
  await page.goto(`${CONSOLE}/workspaces/${businessId}`);
  await page.getByRole("button", { name: "Support access" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Reason for access")
    .fill("Owner requested help with a member import");
  await dialog.getByRole("button", { name: "Start support session" }).click();

  // No main-host session yet: /support/start round-trips through /login.
  await page.waitForURL(/localhost:3000\/login\?next=/);
  expect(new URL(page.url()).origin).toBe(MAIN);
  await submitLogin(page, adminA.email, password);
  await page.waitForURL(`${MAIN}/dashboard`);
  await expect(
    page.getByText("Audited support session · expires after 30 minutes"),
  ).toBeVisible();
  await expect(
    page.locator("aside").getByText(businessName, { exact: true }),
  ).toBeVisible();
  const grant = await db.supportGrant.findFirstOrThrow({
    where: { businessId, actorId: adminA.id },
  });
  expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now());
  expect(
    await db.auditLog.count({
      where: { businessId, action: "SUPPORT_ACCESS_GRANTED" },
    }),
  ).toBe(1);
});
