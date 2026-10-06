import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { saveMember } from "../src/lib/services";
import { cleanup, ensureLocalTest, fixture } from "../scripts/test-support";
import { signIn } from "./sign-in";

test.beforeAll(() => ensureLocalTest());
test.afterAll(() => db.$disconnect());

test("plan taxes, admission, discounts, receipt, renewal and mobile layout", async ({
  page,
}) => {
  const a = await fixture("itest");
  const password = `Billing-${randomUUID()}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await db.account.create({
      data: {
        id: randomUUID(),
        accountId: a.user.id,
        userId: a.user.id,
        providerId: "credential",
        password: await hashPassword(password),
      },
    });
    const member = await saveMember(a.ctx, {
      name: "Billing preview member",
      phone: "9876543210",
    });
    await signIn(page, a.user.email, password);
    await page.waitForURL("**/dashboard");
    await page.goto("/plans");
    await page.getByRole("button", { name: "New plan", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Plan name").fill("Monthly with admission");
    await dialog.getByLabel("Membership fee (₹)", { exact: true }).fill("1000");
    await dialog.getByLabel("Admission fee (₹)", { exact: false }).fill("500");
    await dialog.getByLabel("Tax rate (%)").fill("18");
    await dialog.getByLabel("Tax treatment").selectOption("EXCLUSIVE");
    await page.screenshot({ path: "artifacts/member-billing-plan.png" });
    await dialog
      .getByRole("button", { name: "Create plan", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText("Changes saved");
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    await expect(
      page.getByRole("list", { name: "Membership plans" }),
    ).toContainText("₹1,180");
    const plan = await db.plan.findFirstOrThrow({
      where: { businessId: a.b.id },
    });
    expect(plan.taxRateBps).toBe(1800);
    expect(plan.admissionFeePaise).toBe(50000);

    await page.goto(`/members/${member.id}`);
    const form = page.locator("#renew");
    await form
      .getByRole("combobox", { name: /^Discount/ })
      .selectOption("PERCENT");
    await form.getByLabel("Discount (%)", { exact: true }).fill("10");
    await form
      .getByLabel("Discount reason", { exact: true })
      .fill("Joining offer");
    const preview = form.getByRole("definition").filter({ hasText: "₹1,593" });
    await expect(preview).toBeVisible();
    await form.getByLabel("Include admission fee", { exact: false }).uncheck();
    await expect(form.getByLabel("Charge breakdown")).toContainText("₹1,062");
    await form.getByLabel("Include admission fee", { exact: false }).check();
    await page.setViewportSize({ width: 390, height: 844 });
    await form.scrollIntoViewIfNeeded();
    await expect(form.getByLabel("Charge breakdown")).toContainText("₹1,593");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/member-billing-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await form.getByRole("button", { name: "Activate membership" }).click();
    await expect(
      form.getByRole("heading", { name: "Renew membership" }),
    ).toBeVisible();
    await expect(form.getByRole("combobox", { name: /^Discount/ })).toHaveValue(
      "NONE",
    );
    await expect(
      form.getByLabel("Include admission fee", { exact: false }),
    ).toHaveCount(0);
    await expect(form.getByLabel("Charge breakdown")).toContainText("₹1,180");
    const charge = await db.charge.findFirstOrThrow({
      where: { memberId: member.id },
    });
    expect(charge.amountPaise).toBe(159300);
    expect(charge.taxPaise).toBe(24300);

    await page.getByRole("tab", { name: "Payments", exact: true }).click();
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    await expect(dialog.getByLabel("Amount (₹)")).toHaveValue("1593.00");
    await dialog.getByLabel("Amount (₹)").fill("1000");
    await dialog
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    await page.waitForURL("**/receipts/**");
    await expect(
      page.getByRole("heading", { name: "Payment receipt", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Charge breakdown")).toContainText("₹1,593");
    await expect(page.getByLabel("Charge breakdown")).toContainText("₹243");
    await expect(
      page
        .locator(".doc-row")
        .filter({ has: page.getByText("Balance due", { exact: true }) })
        .getByText("₹593.00", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "artifacts/member-billing-receipt.png",
      fullPage: true,
    });
    await page.emulateMedia({ media: "print" });
    await expect(page.getByLabel("Charge breakdown")).toBeVisible();
    await page.screenshot({
      path: "artifacts/member-billing-receipt-print.png",
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });

    await page.goto("/plans");
    await page.getByRole("button", { name: "Edit plan", exact: true }).click();
    await dialog.getByLabel("Membership fee (₹)", { exact: true }).fill("1180");
    await dialog.getByLabel("Tax treatment").selectOption("INCLUSIVE");
    await dialog
      .getByRole("button", { name: "Save plan", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText("Changes saved");
    await page.goto(`/members/${member.id}`);
    await form
      .getByRole("combobox", { name: /^Discount/ })
      .selectOption("FIXED");
    await form.getByLabel("Discount amount (₹)", { exact: true }).fill("118");
    await form
      .getByLabel("Discount reason", { exact: true })
      .fill("Renewal offer");
    await expect(form.getByLabel("Charge breakdown")).toContainText(
      "Tax (18%, included)",
    );
    await expect(form.getByLabel("Charge breakdown")).toContainText("₹162");
    await form.getByRole("button", { name: "Activate membership" }).click();
    await expect(page.getByText("2 terms", { exact: true })).toBeVisible();
    const charges = await db.charge.findMany({
      where: { memberId: member.id },
      orderBy: { createdAt: "asc" },
    });
    expect(charges.map((c) => c.amountPaise)).toEqual([159300, 106200]);
    expect(charges[1].admissionFeePaise).toBe(0);
    expect(charges[1].taxPaise).toBe(16200);
    expect(errors).toEqual([]);
  } finally {
    await cleanup(a.b.id);
  }
});
