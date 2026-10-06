import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashPassword } from "better-auth/crypto";
import sharp from "sharp";
import jsQR from "jsqr";
import { db } from "../src/lib/db";
import { cleanup, ensureLocalTest, fixture } from "../scripts/test-support";
import {
  saveMember,
  savePlan,
  createMembership,
  recordPayment,
  waiveCharge,
} from "../src/lib/services";
import { dayString, todayIST } from "../src/lib/domain";
import { readMemberBill } from "../src/lib/member-documents";
import { saveMemberPhoto, removeMemberPhoto } from "../src/lib/member-photo";
import { readMemberQr } from "../src/lib/member-qr";
import { saveBusinessLogo } from "../src/lib/business-logo";
import { signIn } from "./sign-in";

test.beforeAll(() => ensureLocalTest());
test.afterAll(() => db.$disconnect());
test.use({ actionTimeout: 15000 });
const row = (page: Page, name: string) =>
  page
    .locator(".doc-row")
    .filter({ has: page.getByText(name, { exact: true }) })
    .locator("dd");
async function download(page: Page, name: string, width: number) {
  const result = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download image", exact: true })
    .click();
  const file = await result;
  expect(file.suggestedFilename()).toMatch(/\.png$/);
  const path = `artifacts/member-documents/${name}.png`;
  await file.saveAs(path);
  const content = await readFile(path);
  const meta = await sharp(content).metadata();
  expect(meta.width).toBe(width);
  expect(meta.height).toBeGreaterThan(1000);
  const stats = await sharp(content).stats();
  expect(stats.channels[0].stdev).toBeGreaterThan(15);
  return content;
}

test("live bills, photos, card image export, QR, print, corrections and access", async ({
  page,
  browser,
}) => {
  const a = await fixture("itest"),
    other = await fixture("itest");
  const password = `Documents-${randomUUID()}`;
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const photo = await sharp(
    Buffer.from(
      '<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="400" fill="#bbd8e8"/><circle cx="200" cy="148" r="75" fill="#344d69"/><ellipse cx="200" cy="365" rx="140" ry="125" fill="#344d69"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const logo = await sharp(
    Buffer.from(
      '<svg width="160" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="160" fill="white"/><path d="M25 100L65 45L92 85L120 45L137 60L95 120L67 79L44 112Z" fill="#1769c2"/></svg>',
    ),
  )
    .png()
    .toBuffer();
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
      name: "Ananya Patel",
      phone: "9876543210",
    });
    const plan = await savePlan(a.ctx, {
      name: "Monthly membership",
      months: "1",
      amount: "1000",
      admissionFee: "500",
      taxRate: "18",
      taxMode: "EXCLUSIVE",
    });
    const term = await createMembership(a.ctx, {
      memberId: member.id,
      planId: plan.id,
      startDate: dayString(todayIST()),
      dueDate: dayString(todayIST()),
      discountType: "PERCENT",
      discountValue: "10",
      discountReason: "Joining offer",
    });
    const charge = await db.charge.findUniqueOrThrow({
      where: { membershipId: term.id },
    });
    expect(await readMemberBill(other.ctx, charge.id)).toBeNull();
    await expect(saveMemberPhoto(other.ctx, member.id, photo)).rejects.toThrow(
      "Member not found",
    );
    await expect(removeMemberPhoto(other.ctx, member.id)).rejects.toThrow(
      "Member not found",
    );
    await saveBusinessLogo(a.ctx, logo);

    await signIn(page, a.user.email, password);
    await page.waitForURL("**/dashboard");
    await page.goto("/settings");
    await page
      .getByLabel("Business name", { exact: true })
      .fill("membrr Fitness");
    await page
      .getByLabel("Business phone", { exact: true })
      .fill("080 4567 8900");
    await page
      .getByLabel("Business address", { exact: false })
      .fill("24 Park Avenue, 2nd Floor, Bengaluru");
    await page
      .getByLabel("Business name", { exact: true })
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Save changes" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Business details saved",
    );

    await page.goto(`/members/${member.id}`);
    await page
      .getByRole("button", { name: "Edit member", exact: true })
      .click();
    const editor = page.getByRole("dialog");
    await editor.locator('input[type="file"]').setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: photo,
    });
    await editor
      .getByRole("button", { name: "Save photo", exact: true })
      .click();
    await expect(editor.getByRole("status")).toHaveText("Member photo saved.");
    await editor.getByRole("button", { name: "Close dialog" }).click();
    const photoResponse = await page.request.get(
      `/api/members/${member.id}/photo`,
    );
    expect(photoResponse.status()).toBe(200);
    expect(photoResponse.headers()["cache-control"]).toContain("no-store");
    expect((await sharp(await photoResponse.body()).metadata()).format).toBe(
      "webp",
    );
    expect(
      (
        await page.request.post(`/api/members/${member.id}/photo`, {
          data: "not an image",
          headers: { origin },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.delete(`/api/members/${member.id}/photo`, {
          headers: { origin: "https://invalid.example" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(`/api/members/${member.id}/photo`, {
          data: Buffer.alloc(2 * 1024 * 1024 + 1),
          headers: { origin },
        })
      ).status(),
    ).toBe(413);
    expect(
      (await page.request.get(`/api/members/not-a-member/photo`)).status(),
    ).toBe(404);

    await page.getByRole("tab", { name: "Payments", exact: true }).click();
    await page.getByRole("link", { name: "View bill", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Membership bill", exact: true }),
    ).toBeVisible();
    await expect(row(page, "Final amount")).toHaveText("₹1,593.00");
    await expect(row(page, "Balance due")).toHaveText("₹1,593.00");
    await expect(page.getByText("Unpaid", { exact: true })).toBeVisible();
    await expect(page.getByAltText(`Photo of ${member.name}`)).toBeVisible();
    await download(page, "implemented-bill", 2000);

    const payment = await recordPayment(a.ctx, {
      chargeId: charge.id,
      amountPaise: 100000,
      method: "UPI",
      reference: "Demo transaction 123",
      idempotencyKey: randomUUID(),
    });
    await page.goto(`/receipts/${payment.id}`);
    await expect(row(page, "Balance due")).toHaveText("₹593.00");
    await expect(row(page, "Amount recorded")).toHaveText("₹1,000.00");
    await expect(page.getByText("Part paid", { exact: true })).toBeVisible();
    await download(page, "implemented-receipt", 2000);
    await page.pdf({
      path: "artifacts/member-documents/implemented-receipt.pdf",
      printBackground: true,
      preferCSSPageSize: true,
    });

    await page.goto(`/members/${member.id}`);
    await page.getByRole("button", { name: "Member QR", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Open membership card", exact: true }),
    ).toBeVisible();
    await page.goto(`/member-card/${member.id}`);
    await expect(
      page.getByRole("heading", { name: member.name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const exported = await download(page, "implemented-card", 2160);
    const decoded = await sharp(exported)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const actual = jsQR(
      new Uint8ClampedArray(decoded.data),
      decoded.info.width,
      decoded.info.height,
    );
    const qr = await readMemberQr(a.ctx, member.id);
    const original = await sharp(Buffer.from(qr!.image.split(",")[1], "base64"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const expected = jsQR(
      new Uint8ClampedArray(original.data),
      original.info.width,
      original.info.height,
    );
    expect(actual?.data).toBeTruthy();
    expect(actual?.data).toBe(expected?.data);
    await page.screenshot({
      path: "artifacts/member-documents/implemented-card-mobile.png",
      fullPage: true,
    });
    await page.pdf({
      path: "artifacts/member-documents/implemented-card.pdf",
      printBackground: true,
      preferCSSPageSize: true,
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/receipts/${payment.id}`);
    await page.getByRole("button", { name: "Correct this payment" }).click();
    await page
      .getByLabel("Reason for correction")
      .fill("Recorded against the wrong transaction");
    await page
      .getByRole("button", { name: "Record reversal", exact: true })
      .click();
    await expect(page.getByText(/This payment was reversed on/)).toBeVisible();
    await expect(row(page, "Total paid")).toHaveText("₹0.00");
    await expect(
      page.getByRole("button", { name: "Correct this payment" }),
    ).toHaveCount(0);
    await waiveCharge(a.ctx, charge.id, "Courtesy membership for testing");
    await page.goto(`/bills/${charge.id}`);
    await expect(row(page, "Final amount")).toHaveText("₹0.00");
    await expect(row(page, "Balance due")).toHaveText("₹0.00");
    await expect(page.getByText("Waived", { exact: true })).toBeVisible();

    // Long real-world fields grow the document instead of cropping its contents.
    await db.member.update({
      where: { id: member.id },
      data: { name: "Ananya " + "Narayanan ".repeat(8) },
    });
    await db.business.update({
      where: { id: a.b.id },
      data: {
        name: "Community Fitness and Wellness Centre " + "Bengaluru ".repeat(6),
        address:
          "Park Avenue, Third Floor, " + "Bengaluru District, ".repeat(15),
      },
    });
    await page.goto(`/member-card/${member.id}`);
    expect(
      await page
        .locator(".member-document")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await download(page, "long-card", 2160);
    await removeMemberPhoto(a.ctx, member.id);
    await db.businessLogo.delete({ where: { businessId: a.b.id } });
    await page.goto(`/member-card/${member.id}`);
    await expect(page.locator(".doc-portrait img")).toHaveCount(0);
    await expect(page.locator(".doc-logo img")).toHaveCount(0);

    const anon = await browser.newContext();
    try {
      expect(
        (
          await anon.request.get(`${origin}/api/members/${member.id}/photo`)
        ).status(),
      ).toBe(403);
      const anonPage = await anon.newPage();
      await anonPage.goto(`${origin}/bills/${charge.id}`);
      await expect(anonPage).toHaveURL(/\/login/);
    } finally {
      await anon.close();
    }
    expect(errors).toEqual([]);
  } finally {
    await cleanup(a.b.id);
    await cleanup(other.b.id);
  }
});
