import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { fixture, cleanup, ensureLocalTest } from "../scripts/test-support";
import { todayIST } from "../src/lib/domain";
import { signIn } from "./sign-in";

test.beforeAll(() => ensureLocalTest());
test.afterAll(() => db.$disconnect());

async function login(page: Page, email: string, password: string) {
  await signIn(page, email, password);
  await page.waitForURL("**/dashboard");
}

test("business logo preview, upload, replacement, receipt, removal and permissions", async ({
  page,
  browser,
}) => {
  const a = await fixture("itest"),
    b = await fixture("itest");
  const password = `Logo-test-${randomUUID()}`;
  const staffId = randomUUID(),
    staffEmail = `${staffId}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const content = await sharp({
    create: { width: 180, height: 90, channels: 4, background: "#17aa88" },
  })
    .png()
    .toBuffer();
  const replacement = await sharp({
    create: { width: 90, height: 180, channels: 4, background: "#7766dd" },
  })
    .webp()
    .toBuffer();
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  try {
    for (const user of [a.user, b.user]) {
      await db.account.create({
        data: {
          id: randomUUID(),
          accountId: user.id,
          userId: user.id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      });
    }
    await db.user.create({
      data: {
        id: staffId,
        name: "Logo test staff",
        email: staffEmail,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: staffId,
            providerId: "credential",
            password: await hashPassword(password),
          },
        },
        access: { create: { businessId: a.b.id, role: "STAFF" } },
      },
    });

    await login(page, a.user.email, password);
    await page.goto("/settings");
    await expect(
      page.getByRole("button", { name: "Choose logo", exact: true }),
    ).toBeVisible();
    const chooser = page.getByLabel("Choose business logo", { exact: true });
    await chooser.setInputFiles({
      name: "logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
    await expect(
      page.getByRole("alert").filter({ hasText: "Choose a PNG" }),
    ).toContainText("PNG, JPG, or WebP");
    await chooser.setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: content,
    });
    await expect(
      page.getByText("logo.png · Preview, not saved yet", { exact: true }),
    ).toBeVisible();
    expect(
      await db.businessLogo.findUnique({ where: { businessId: a.b.id } }),
    ).toBeNull();
    await page.getByRole("button", { name: "Save logo", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Business logo saved.");
    const sidebarLogo = page.locator("aside img");
    await expect(sidebarLogo).toHaveAttribute(
      "src",
      /\/api\/business\/logo\?v=/,
    );
    await expect(sidebarLogo).toHaveJSProperty("naturalWidth", 180);
    const firstSrc = await sidebarLogo.getAttribute("src");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Remove logo", exact: true }),
    ).toBeVisible();
    await expect(page.locator("aside img")).toHaveJSProperty(
      "naturalWidth",
      180,
    );
    await page.screenshot({ path: "artifacts/business-logo-settings.png" });

    const invalid = await page.request.post("/api/business/logo", {
      data: Buffer.from("<html>bad logo</html>"),
      headers: { Origin: origin, "Content-Type": "image/png" },
    });
    expect(invalid.status()).toBe(400);
    expect(
      (
        await db.businessLogo.findUniqueOrThrow({
          where: { businessId: a.b.id },
        })
      ).version,
    ).toBe(firstSrc!.split("=")[1]);
    const crossOrigin = await page.request.delete("/api/business/logo", {
      headers: { Origin: "https://unrelated.example" },
    });
    expect(crossOrigin.status()).toBe(403);
    await chooser.setInputFiles({
      name: "replacement.webp",
      mimeType: "image/webp",
      buffer: replacement,
    });
    await page.getByRole("button", { name: "Save logo", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Business logo saved.");
    await expect(page.locator("aside img")).not.toHaveAttribute(
      "src",
      firstSrc!,
    );
    await expect(page.locator("aside img")).toHaveJSProperty(
      "naturalWidth",
      90,
    );

    const contact = await db.contact.create({
      data: { businessId: a.b.id, phone: "919800000099" },
    });
    const member = await db.member.create({
      data: {
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        name: "Logo receipt member",
        code: "LOGO-TEST",
        contactId: contact.id,
      },
    });
    const plan = await db.plan.create({
      data: {
        businessId: a.b.id,
        name: "Logo test plan",
        months: 1,
        amountPaise: 10000,
      },
    });
    const membership = await db.membership.create({
      data: {
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        memberId: member.id,
        planId: plan.id,
        planName: plan.name,
        startDate: todayIST(),
        endDate: todayIST(),
      },
    });
    const charge = await db.charge.create({
      data: {
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        memberId: member.id,
        membershipId: membership.id,
        amountPaise: 10000,
        dueDate: todayIST(),
        description: "Logo receipt test",
      },
    });
    const payment = await db.payment.create({
      data: {
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        chargeId: charge.id,
        amountPaise: 10000,
        method: "CASH",
        recordedBy: a.user.id,
        idempotencyKey: randomUUID(),
      },
    });
    await page.goto(`/receipts/${payment.id}`);
    await expect(
      page.getByRole("img", { name: `${a.b.name} logo`, exact: true }),
    ).toHaveJSProperty("naturalWidth", 90);
    await page.emulateMedia({ media: "print" });
    await expect(
      page.getByRole("img", { name: `${a.b.name} logo`, exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: "artifacts/business-logo-receipt.png" });
    await page.emulateMedia({ media: "screen" });

    const staffContext = await browser.newContext({ baseURL: origin });
    contexts.push(staffContext);
    const staffPage = await staffContext.newPage();
    await login(staffPage, staffEmail, password);
    expect((await staffPage.request.get("/api/business/logo")).status()).toBe(
      200,
    );
    expect(
      (
        await staffPage.request.post("/api/business/logo", {
          data: content,
          headers: { Origin: origin },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await staffPage.request.delete("/api/business/logo", {
          headers: { Origin: origin },
        })
      ).status(),
    ).toBe(403);
    const otherContext = await browser.newContext({ baseURL: origin });
    contexts.push(otherContext);
    const otherPage = await otherContext.newPage();
    await login(otherPage, b.user.email, password);
    expect((await otherPage.request.get("/api/business/logo")).status()).toBe(
      404,
    );
    const anonymous = await browser.newContext({ baseURL: origin });
    contexts.push(anonymous);
    expect((await anonymous.request.get("/api/business/logo")).status()).toBe(
      403,
    );

    await page.goto("/settings");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "artifacts/business-logo-mobile.png" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page
      .getByRole("button", { name: "Remove logo", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Business logo removed.");
    await expect(
      page.getByRole("button", { name: "Choose logo", exact: true }),
    ).toBeVisible();
    expect(
      await db.businessLogo.findUnique({ where: { businessId: a.b.id } }),
    ).toBeNull();
    expect((await page.request.get("/api/business/logo")).status()).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await cleanup(a.b.id);
    await cleanup(b.b.id);
  }
});
