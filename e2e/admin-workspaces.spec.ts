import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { createBusiness } from "../src/lib/admin";
import { ensureLocalTest } from "../scripts/test-support";
import { signIn, submitLogin } from "./sign-in";

const CONSOLE = "http://console.localhost:3000";
const MAIN = "http://localhost:3000";

test.beforeAll(() => ensureLocalTest());
test.afterAll(() => db.$disconnect());

test("admin creates workspaces in the console and opens them on the main host", async ({
  page,
}) => {
  const run = randomUUID();
  const adminId = randomUUID();
  const email = `admin-${run}@example.test`;
  const password = `Admin-check-${randomUUID()}`;
  const names = [`itest-admin-first-${run}`, `itest-admin-second-${run}`];
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await db.user.create({
    data: {
      id: adminId,
      name: "Test administrator",
      email,
      platformAdmin: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: adminId,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  try {
    await expect(
      createBusiness(randomUUID(), names[0], "Bengaluru"),
    ).rejects.toThrow("Platform administrator access required");
    await expect(createBusiness(adminId, "", "Bengaluru")).rejects.toThrow(
      "business name and city",
    );

    await signIn(page, email, password, 4, CONSOLE);
    await page.waitForURL(`${CONSOLE}/`);

    const ids: string[] = [];
    for (const name of names) {
      await page.goto(`${CONSOLE}/workspaces`);
      await page
        .getByRole("button", { name: "New business", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("textbox")).toHaveCount(2);
      await expect(dialog.getByText(/SMTP|invitation/i)).toHaveCount(0);
      await dialog.getByLabel("Business name").fill(name);
      await dialog.getByLabel("City").fill("Bengaluru");
      await dialog
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
      await page.waitForURL(`${CONSOLE}/workspaces/*`);
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();

      const business = await db.business.findFirstOrThrow({
        where: { name },
        include: {
          access: true,
          branches: true,
          invitations: true,
          audit: true,
        },
      });
      ids.push(business.id);
      expect(page.url()).toBe(`${CONSOLE}/workspaces/${business.id}`);
      expect(
        business.access.map(({ userId, role }) => ({ userId, role })),
      ).toEqual([{ userId: adminId, role: "OWNER" }]);
      expect(business.branches).toHaveLength(1);
      expect(business.invitations).toHaveLength(0);
      expect(business.audit[0].action).toBe("BUSINESS_CREATED");
      expect(business.trialRequired).toBe(true);
      expect(
        business.trialEndsAt!.getTime() - business.createdAt.getTime(),
      ).toBe(72 * 60 * 60 * 1000);
      expect(business.monthlyFeePaise).toBe(49900);
    }

    // Handoff: the main host has no session yet, so /open/<id> round-trips
    // through /login?next= and then lands on the selected workspace.
    await page.goto(`${CONSOLE}/workspaces/${ids[0]}`);
    const open = page.getByRole("link", {
      name: "Open workspace",
      exact: true,
    });
    await expect(open).toHaveAttribute("href", `${MAIN}/open/${ids[0]}`);
    await open.click();
    await page.waitForURL(/\/login\?next=/);
    expect(new URL(page.url()).origin).toBe(MAIN);
    await submitLogin(page, email, password);
    await page.waitForURL(`${MAIN}/dashboard`);
    await expect(
      page.locator("aside").getByText(names[0], { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Three-day free trial/)).toBeVisible();

    // Second workspace: session now exists on both hosts, so it is direct.
    await page.goto(`${CONSOLE}/workspaces/${ids[1]}`);
    await page
      .getByRole("link", { name: "Open workspace", exact: true })
      .click();
    await page.waitForURL(`${MAIN}/dashboard`);
    await expect(
      page.locator("aside").getByText(names[1], { exact: true }),
    ).toBeVisible();

    // A workspace the admin does not own is refused by the handoff.
    const unrelated = await db.business.findUniqueOrThrow({
      where: { slug: "demo-iron-republic" },
    });
    const refused = await page.goto(`${MAIN}/open/${unrelated.id}`);
    expect(refused?.status()).toBe(403);
    await expect(
      page.getByText("owner access", { exact: false }),
    ).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    const businesses = await db.business.findMany({
      where: { name: { in: names } },
    });
    for (const { id } of businesses) {
      await db.$transaction([
        db.auditLog.deleteMany({ where: { businessId: id } }),
        db.staffAccess.deleteMany({ where: { businessId: id } }),
        db.branch.deleteMany({ where: { businessId: id } }),
        db.business.delete({ where: { id } }),
      ]);
    }
    await db.auditLog.deleteMany({ where: { actorId: adminId } });
    await db.user.deleteMany({ where: { id: adminId } });
  }
});
