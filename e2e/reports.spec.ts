import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { addDays, dayString, todayIST } from "../src/lib/domain";
import { saveMember } from "../src/lib/services";
import { cleanup, ensureLocalTest, fixture } from "../scripts/test-support";
import { signIn } from "./sign-in";

test.beforeAll(() => ensureLocalTest());
test.afterAll(() => db.$disconnect());

test("reports filters, all-row downloads, access controls and responsive tables", async ({
  page,
  browser,
}) => {
  const a = await fixture("itest"),
    password = `Reports-${randomUUID()}`,
    today = todayIST();
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
      name: "Aarav Report",
      phone: "9876543210",
    });
    const plan = await db.plan.create({
      data: {
        businessId: a.b.id,
        name: "Monthly fitness",
        months: 1,
        amountPaise: 200000,
      },
    });
    const term = await db.membership.create({
      data: {
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        memberId: member.id,
        planId: plan.id,
        planName: plan.name,
        startDate: addDays(today, -20),
        endDate: addDays(today, 9),
      },
    });
    const charge = await db.charge.create({
      data: {
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        memberId: member.id,
        membershipId: term.id,
        amountPaise: 200000,
        description: plan.name,
        dueDate: addDays(today, -15),
      },
    });
    await db.payment.create({
      data: {
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        chargeId: charge.id,
        amountPaise: 50000,
        method: "UPI",
        recordedBy: a.user.id,
        idempotencyKey: randomUUID(),
      },
    });
    await db.checkin.create({
      data: {
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        memberId: member.id,
        day: today,
        recordedBy: a.user.id,
      },
    });
    await db.member.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        id: randomUUID(),
        businessId: a.b.id,
        branchId: a.ctx.branchId,
        contactId: member.contactId,
        code: `REPORT-${i}`,
        name: `Report member ${String(i).padStart(2, "0")}`,
      })),
    });
    await signIn(page, a.user.email, password);
    await page.waitForURL("**/dashboard");
    await page.getByRole("link", { name: "Reports", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Reports", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toContainText("Aarav Report");
    await expect(page.getByText("Showing 1–25 of 31")).toBeVisible();
    await page.screenshot({
      path: "artifacts/reports-members-desktop.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page.getByText("Showing 26–31 of 31")).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export CSV", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^membrr-members-/);
    const csv = await readFile((await download.path())!, "utf8");
    expect(csv.trim().split("\r\n")).toHaveLength(32);
    expect(csv).toContain("Aarav Report");
    await page
      .getByRole("combobox", { name: /^Member status/ })
      .selectOption("active");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page.getByText("Showing 1–1 of 1")).toBeVisible();
    await page
      .getByRole("navigation", { name: "Report types" })
      .getByRole("link", { name: "Collections", exact: true })
      .click();
    await expect(page.getByRole("table")).toContainText("₹500");
    await page
      .getByRole("combobox", { name: /^Group by/ })
      .selectOption("week");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page).toHaveURL(/group=week/);
    await expect(page.getByRole("table")).toContainText("₹500");
    await page.screenshot({
      path: "artifacts/reports-collections-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("combobox", { name: /^Payment method/ })
      .selectOption("CASH");
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page.getByRole("table")).not.toContainText("₹500");
    await page
      .getByLabel("From date", { exact: true })
      .fill(dayString(addDays(today, 1)));
    await page.getByLabel("To date", { exact: true }).fill(dayString(today));
    await expect(page.getByRole("combobox", { name: /^Period/ })).toHaveValue(
      "custom",
    );
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "end date must be on or after",
    );
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
    const invalid = await page.request.get(
      "/api/reports/export?type=collections&period=custom&from=invalid&to=invalid",
    );
    expect(invalid.status()).toBe(400);
    await page
      .getByRole("navigation", { name: "Report types" })
      .getByRole("link", { name: "Dues & outstanding", exact: true })
      .click();
    await expect(page.getByRole("table")).toContainText("₹1,500");
    await expect(page.getByRole("table")).toContainText("1–30 days");
    await expect(page.getByLabel("From date", { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: "artifacts/reports-outstanding-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "Report types" })
      .getByRole("link", { name: "Renewals", exact: true })
      .click();
    await expect(page.getByRole("table")).toContainText("Needs renewal");
    await page
      .getByRole("navigation", { name: "Report types" })
      .getByRole("link", { name: "Attendance", exact: true })
      .click();
    await expect(page.getByRole("table")).toContainText("Aarav Report");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Apply filters" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/reports-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(
      page
        .locator("#workspace-navigation")
        .getByRole("link", { name: "Reports", exact: true }),
    ).toBeVisible();
    await page
      .locator("#workspace-navigation")
      .getByRole("link", { name: "Reports", exact: true })
      .click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(
      page.getByRole("combobox", { name: /^Member status/ }),
    ).toBeVisible();
    await page
      .getByRole("form", { name: "Report filters" })
      .getByLabel("Search members", { exact: true })
      .fill("missing report member");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(
      page.getByRole("heading", { name: "No matching results" }),
    ).toBeVisible();
    await db.staffAccess.update({
      where: { businessId_userId: { businessId: a.b.id, userId: a.user.id } },
      data: { role: "STAFF" },
    });
    await page.goto("/reports");
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
    expect((await page.request.get("/api/reports/export")).status()).toBe(403);
    const anonymous = await browser.newContext();
    try {
      const response = await anonymous.request.get(
        `${new URL(page.url()).origin}/api/reports/export`,
        { maxRedirects: 0 },
      );
      expect(response.status()).toBe(307);
      expect(response.headers().location).toBe("/login");
    } finally {
      await anonymous.close();
    }
    await db.business.update({
      where: { id: a.b.id },
      data: { trialRequired: true, trialEndsAt: addDays(today, -1) },
    });
    expect((await page.request.get("/api/reports/export")).status()).toBe(402);
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/upgrade/);
    expect(errors).toEqual([]);
  } finally {
    await cleanup(a.b.id);
  }
});
