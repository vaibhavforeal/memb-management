import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { createBusiness } from "../src/lib/admin";
import { ensureLocalTest } from "../scripts/test-support";
import { signIn } from "./sign-in";

test.beforeAll(() => ensureLocalTest());
test.afterAll(() => db.$disconnect());

test("admin creates and switches owned workspaces without invitations", async ({
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

    await signIn(page, email, password);
    await page.waitForURL("**/admin");

    for (const name of names) {
      await page
        .getByRole("button", { name: "New business", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("textbox")).toHaveCount(2);
      await expect(dialog.getByText(/SMTP|invitation/i)).toHaveCount(0);
      if (name === names[0])
        await page.screenshot({ path: "artifacts/admin-create-workspace.png" });
      await dialog.getByLabel("Business name").fill(name);
      await dialog.getByLabel("City").fill("Bengaluru");
      await dialog
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
      await page.waitForURL("**/dashboard");
      await expect(
        page.locator("aside").getByText(name, { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/Three-day free trial/)).toBeVisible();

      const business = await db.business.findFirstOrThrow({
        where: { name },
        include: {
          access: true,
          branches: true,
          invitations: true,
          audit: true,
        },
      });
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
      await page
        .getByRole("link", { name: "Platform admin", exact: true })
        .click();
      await page.waitForURL("**/admin");
    }

    const firstCard = page.locator("section").filter({
      has: page.getByRole("heading", { name: names[0], exact: true }),
    });
    const openFirst = firstCard.locator("form").filter({
      has: page.getByRole("button", { name: "Open workspace", exact: true }),
    });
    await openFirst
      .getByRole("button", { name: "Open workspace", exact: true })
      .click();
    await page.waitForURL("**/dashboard");
    await expect(
      page.locator("aside").getByText(names[0], { exact: true }),
    ).toBeVisible();

    const unrelated = await db.business.findUniqueOrThrow({
      where: { slug: "demo-iron-republic" },
    });
    await page.context().addCookies([
      {
        name: "membrr-business",
        value: unrelated.id,
        url: new URL(page.url()).origin,
      },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/admin$/);

    await openFirst
      .locator('input[name="businessId"]')
      .evaluate((input, id) => {
        (input as HTMLInputElement).value = id;
      }, unrelated.id);
    await openFirst
      .getByRole("button", { name: "Open workspace", exact: true })
      .click();
    await expect(openFirst.getByRole("alert")).toHaveText(
      "Owner access is required to open this workspace.",
    );
    expect(browserErrors).toEqual([]);
  } finally {
    const businesses = await db.business.findMany({
      where: { name: { in: names } },
    });
    for (const { id } of businesses) {
      await db.$transaction([
        db.auditLog.deleteMany({ where: { businessId: id } }),
        db.staffAccess.deleteMany({
          where: { businessId: id, userId: adminId },
        }),
        db.branch.deleteMany({ where: { businessId: id } }),
        db.business.delete({ where: { id } }),
      ]);
    }
    await db.user.delete({ where: { id: adminId } });
  }
});
