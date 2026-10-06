import { test, expect } from "@playwright/test";
import { db } from "../src/lib/db";
import { ensureLocalTest } from "../scripts/test-support";
import { signIn } from "./sign-in";
import { saveMember } from "../src/lib/services";
import { samplePng } from "../scripts/shared-file-fixtures";
import { todayIST } from "../src/lib/domain";
import QRCode from "qrcode";
test.beforeAll(() => ensureLocalTest());
test.afterAll(() => db.$disconnect());
const loginCookies = new Map<
  string,
  Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>>
>();
async function login(
  page: import("@playwright/test").Page,
  email = "owner@membrr.local",
) {
  const existing = loginCookies.get(email);
  if (existing) {
    await page.context().addCookies(existing);
    await page.goto(email.startsWith("admin") ? "/admin" : "/dashboard");
    return;
  }
  await signIn(page, email);
  await page.waitForURL(
    email.startsWith("admin") ? "**/admin" : "**/dashboard",
  );
  loginCookies.set(email, await page.context().cookies());
}
test("owner journey: member, membership, partial payment, receipt and attendance", async ({
  page,
}) => {
  const name = `Browser Test ${Date.now()}`;
  let memberId: string | undefined;
  try {
    await login(page);
    await page.getByRole("link", { name: "Add member", exact: true }).click();
    await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
    await expect(
      page.locator(
        'input[name="serviceConsent"], input[name="marketingConsent"], input[name="consentSource"]',
      ),
    ).toHaveCount(0);
    await expect(
      page.getByText("WhatsApp preferences", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: "artifacts/member-form-default-whatsapp.png",
    });
    await page.getByLabel("Full name").fill(name);
    await page
      .getByLabel("Mobile number")
      .fill("98" + String(Date.now()).slice(-8));
    await page
      .getByRole("button", { name: "Create member", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        /^\/members\/[^/]+$/.test(url.pathname) &&
        url.pathname !== "/members/new",
    );
    memberId = page.url().split("/").pop();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Activate membership", exact: true })
      .click();
    await expect(
      page.getByText("Membership activated and charge created."),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Payments", exact: true }).click();
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Amount (₹)").fill("1000");
    await dialog.getByLabel("Reference (optional)").fill("BROWSER-TEST");
    await dialog
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    await page.waitForURL("**/receipts/**");
    await expect(
      page.getByText("Payment receipt", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "This payment", exact: true }),
    ).toContainText("₹1,000.00");
    await page.getByRole("link", { name: "Back to member" }).click();
    await expect(
      page.getByText("₹1,500 outstanding", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(
      page.getByText("Checked in for today.", { exact: true }),
    ).toBeVisible();
    const stored = await db.member.findUniqueOrThrow({
      where: { id: memberId },
      include: {
        memberships: { include: { charge: { include: { payments: true } } } },
        checkins: true,
      },
    });
    expect(stored.memberships).toHaveLength(1);
    expect(stored.checkins).toHaveLength(1);
    expect(stored.memberships[0].charge?.payments[0].amountPaise).toBe(100000);
  } finally {
    if (memberId) {
      const m = await db.member.findUnique({ where: { id: memberId } });
      if (m?.name.startsWith("Browser Test ")) {
        const charges = await db.charge.findMany({ where: { memberId } });
        await db.payment.deleteMany({
          where: { chargeId: { in: charges.map((c) => c.id) } },
        });
        await db.charge.deleteMany({ where: { memberId } });
        await db.checkin.deleteMany({ where: { memberId } });
        await db.membership.deleteMany({ where: { memberId } });
        await db.member.delete({ where: { id: memberId } });
        await db.contact.delete({ where: { id: m.contactId } });
      }
    }
  }
});
test("dashboard and owner screens load without browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  for (const path of [
    "/members",
    "/plans",
    "/payments",
    "/attendance",
    "/whatsapp",
    "/settings",
    "/members/import",
    "/whatsapp/new",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText("We couldn’t load this page")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  await page.goto("/dashboard");
  await page.screenshot({ path: "artifacts/dashboard.png", fullPage: true });
});
test("staff cannot export or see owner settings", async ({ page }) => {
  await login(page, "staff@membrr.local");
  await expect(
    page.getByRole("link", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  const response = await page.request.get("/api/members/export");
  expect(response.status()).toBe(403);
  expect(
    (
      await page.request.get("/api/members/export?scope=filtered&status=unpaid")
    ).status(),
  ).toBe(403);
  await page.goto("/members");
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
});

test("member filters, exports and profile tabs work on desktop and mobile", async ({
  page,
}) => {
  const business = await db.business.findUniqueOrThrow({
    where: { slug: "demo-iron-republic" },
  });
  const member = await db.member.findFirstOrThrow({
    where: {
      businessId: business.id,
      archived: false,
      memberships: {
        some: {
          cancelledAt: null,
          startDate: { lte: todayIST() },
          endDate: { gte: todayIST() },
        },
      },
    },
    include: {
      memberships: {
        where: {
          cancelledAt: null,
          startDate: { lte: todayIST() },
          endDate: { gte: todayIST() },
        },
      },
    },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page.goto("/members");
  const statuses = page.getByRole("navigation", { name: "Member status" });
  await expect(statuses.getByRole("link", { name: /^All / })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await statuses.getByRole("link", { name: /^Active / }).click();
  await expect(
    statuses.getByRole("link", { name: /^Active / }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByPlaceholder("Name, phone or member ID").fill(member.name);
  await page
    .getByRole("combobox", { name: "Plan", exact: true })
    .selectOption(member.memberships[0].planId);
  await page
    .getByRole("combobox", { name: "Sort by", exact: true })
    .selectOption("name-asc");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/status=active/);
  await expect(page).toHaveURL(/sort=name-asc/);
  const table = page.getByRole("table", { name: "Members", exact: true });
  await expect(table.getByText(member.code, { exact: true })).toBeVisible();
  const csvLink = await page
    .getByRole("link", { name: "Export CSV" })
    .getAttribute("href");
  const csv = await page.request.get(csvLink!);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(member.code);
  expect(await csv.text()).toContain("outstanding_inr");
  await page.getByRole("link", { name: "Reset", exact: true }).click();
  await expect(page).toHaveURL(/\/members$/);
  await page
    .getByRole("combobox", { name: "Fees", exact: true })
    .selectOption("unpaid");
  await page
    .getByRole("combobox", { name: "Sort by", exact: true })
    .selectOption("expiry-asc");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/fees=unpaid/);
  await expect(table.getByRole("row").nth(1)).not.toContainText("₹0");
  await page.goto("/members?sort=name-asc");
  const next = page.getByRole("link", { name: "Next", exact: true });
  if (await next.isVisible()) {
    await next.click();
    await expect(page).toHaveURL(/sort=name-asc/);
    await expect(page).toHaveURL(/page=2/);
    await page.getByRole("link", { name: "Previous", exact: true }).click();
    await expect(page).not.toHaveURL(/page=2/);
  }
  await page.screenshot({
    path: "artifacts/member-directory-1440.png",
    fullPage: true,
  });
  await page.goto(`/members/${member.id}?tab=payments`);
  await expect(
    page.getByRole("tab", { name: "Payments", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Membership charges" }),
  ).toBeVisible();
  await page.reload();
  const paymentsTab = page.getByRole("tab", { name: "Payments", exact: true });
  await expect(paymentsTab).toHaveAttribute("aria-selected", "true");
  await paymentsTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Attendance", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", { name: "Payments", exact: true }),
  ).toBeHidden();
  await page.goBack();
  await expect(paymentsTab).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Memberships", exact: true }).click();
  await page.getByLabel("Start date", { exact: true }).fill("2027-12-01");
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Member notes" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Memberships", exact: true }).click();
  await expect(page.getByLabel("Start date", { exact: true })).toHaveValue(
    "2027-12-01",
  );
  await page.getByRole("tab", { name: "WhatsApp", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Manual message history" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Payments", exact: true }).click();
  await page.screenshot({
    path: "artifacts/member-profile-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/members",
    `/members/${member.id}?tab=notes`,
    `/members/${member.id}?tab=payments`,
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "artifacts/member-profile-390.png",
    fullPage: true,
  });
  await page.goto("/members");
  await expect(table).toBeVisible();
  await page.screenshot({
    path: "artifacts/member-directory-390.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("platform administrator sees businesses without automatic tenant access", async ({
  page,
}) => {
  await login(page, "admin@membrr.local");
  await expect(
    page.getByRole("heading", { name: "Workspaces", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Support access" }).first(),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/admin$/);
});
test("mobile navigation works without horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Members", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your members" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/mobile-members.png",
    fullPage: true,
  });
});
test("unauthenticated webhooks require a valid signature", async ({
  request,
}) => {
  const response = await request.post("/api/webhooks/whatsapp", {
    data: { entry: [] },
  });
  expect(response.status()).toBe(401);
});

test("manual WhatsApp prepares an editable chat link and records only explicit confirmation", async ({
  page,
}) => {
  const business = await db.business.findUniqueOrThrow({
    where: { slug: "demo-iron-republic" },
    include: { branches: true, access: { where: { role: "OWNER" } } },
  });
  const member = await saveMember(
    {
      businessId: business.id,
      branchId: business.branches[0].id,
      userId: business.access[0].userId,
      role: "OWNER",
      support: false,
    },
    {
      name: `Manual Browser ${Date.now()}`,
      phone: "97" + String(Date.now()).slice(-8),
    },
  );
  try {
    await login(page);
    await page.goto(`/members/${member.id}`);
    await page.getByRole("tab", { name: "WhatsApp", exact: true }).click();
    await expect(
      page.getByText("WhatsApp enabled", { exact: true }),
    ).toBeVisible();
    await page.goto(`/whatsapp/new?memberId=${member.id}`);
    await expect(
      page.getByRole("heading", { name: "Send a personal message" }),
    ).toBeVisible();
    const body = "Hello!\nYour balance is ₹100 & your next visit is welcome.";
    await page
      .getByRole("textbox", { name: "Message text", exact: true })
      .fill(body, { timeout: 20000 });
    const open = page.getByRole("link", { name: "Open WhatsApp", exact: true });
    const url = new URL((await open.getAttribute("href"))!);
    expect(url.origin).toBe("https://wa.me");
    expect(url.searchParams.get("text")).toBe(body);
    expect(await db.manualSend.count({ where: { memberId: member.id } })).toBe(
      0,
    );
    const record = page.getByRole("button", {
      name: "Record as sent manually",
    });
    await expect(record).toBeDisabled();
    await page.getByLabel("I sent this message in WhatsApp").check();
    await record.click();
    await expect(
      page.getByText("Sent manually", { exact: true }),
    ).toBeVisible();
    expect(await db.manualSend.count({ where: { memberId: member.id } })).toBe(
      1,
    );
    await page.goto("/whatsapp");
    await expect(
      page.getByRole("heading", { name: "WhatsApp", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(member.name, { exact: true })).toBeVisible();
    await page.screenshot({
      path: "artifacts/manual-whatsapp.png",
      fullPage: true,
    });
    await page.goto("/settings");
    await expect(page.getByLabel("WhatsApp Business Account ID")).toHaveCount(
      0,
    );
    await expect(page.getByText("Enable automated reminders")).toHaveCount(0);
    const health = await (await page.request.get("/api/health")).json();
    expect(health.worker).toBe("not_required");
    await page.goto(`/members/${member.id}`);
    await page.getByRole("tab", { name: "WhatsApp", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Stop WhatsApp", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: "artifacts/member-whatsapp-profile.png",
      fullPage: true,
    });
    await db.contact.update({
      where: { id: member.contactId },
      data: { optedOutAt: new Date() },
    });
    await page.reload();
    await expect(
      page.getByText("WhatsApp stopped", { exact: true }),
    ).toBeVisible();
    await page.goto(`/whatsapp/new?memberId=${member.id}`);
    await expect(
      page.getByText("This contact has opted out of WhatsApp messages."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open WhatsApp", exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.manualSend.deleteMany({ where: { memberId: member.id } });
    await db.member.delete({ where: { id: member.id } });
    await db.contact.delete({ where: { id: member.contactId } });
  }
});

test("file links upload, download without login, survive reload, appear in WhatsApp and revoke", async ({
  page,
  request,
}) => {
  const business = await db.business.findUniqueOrThrow({
    where: { slug: "demo-iron-republic" },
    include: { branches: true, access: { where: { role: "OWNER" } } },
  });
  const member = await saveMember(
    {
      businessId: business.id,
      branchId: business.branches[0].id,
      userId: business.access[0].userId,
      role: "OWNER",
      support: false,
    },
    {
      name: `File Browser ${Date.now()}`,
      phone: "96" + String(Date.now()).slice(-8),
    },
  );
  const filename = `Schedule नियम ${Date.now()}.png`;
  let fileId: string | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/whatsapp/new?memberId=${member.id}`);
    await expect(
      page.getByText("Local links cannot be opened on other devices."),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Message text", exact: true })
      .fill("Hi, your new schedule is attached below.");
    await page.getByLabel("Upload an image or document").setInputFiles({
      name: filename,
      mimeType: "image/png",
      buffer: samplePng,
    });
    await expect(
      page.getByText(
        "File uploaded. Its link is included in the message preview.",
      ),
    ).toBeVisible();
    const stored = await db.sharedFile.findFirstOrThrow({
      where: { businessId: business.id, name: filename },
    });
    fileId = stored.id;
    const fileLink = page.getByRole("link", { name: filename, exact: true });
    const url = (await fileLink.getAttribute("href"))!;
    const download = await request.get(url);
    expect(download.status()).toBe(200);
    expect(await download.body()).toEqual(samplePng);
    expect(download.headers()["content-type"]).toBe("image/png");
    expect(download.headers()["content-disposition"]).toContain("attachment;");
    expect(download.headers()["cache-control"]).toContain("no-store");
    expect((await request.get("/api/shared-files")).status()).toBe(403);
    expect(
      (
        await request.post("/api/shared-files", {
          headers: {
            Origin: "http://localhost:3000",
            "X-File-Name": "rules.png",
          },
          data: samplePng,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.delete(`/api/shared-files/${fileId}`, {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post("/api/shared-files", {
          headers: {
            Origin: "http://localhost:3000",
            "X-File-Name": "fake.pdf",
          },
          data: "<html>not a PDF</html>",
        })
      ).status(),
    ).toBe(400);
    const open = page.getByRole("link", { name: "Open WhatsApp", exact: true });
    expect(
      new URL((await open.getAttribute("href"))!).searchParams.get("text"),
    ).toContain(url);
    await page.getByLabel("I sent this message in WhatsApp").check();
    await page.getByLabel(`Include ${filename}`, { exact: true }).uncheck();
    await expect(
      page.getByRole("button", { name: "Record as sent manually" }),
    ).toBeDisabled();
    expect(
      new URL((await open.getAttribute("href"))!).searchParams.get("text"),
    ).not.toContain(url);
    await page.reload();
    await expect(fileLink).toBeVisible();
    await page.getByLabel(`Include ${filename}`, { exact: true }).check();
    await page
      .getByRole("textbox", { name: "Message text", exact: true })
      .fill("x".repeat(1950));
    await expect(
      page.getByRole("button", { name: "Message is too long" }),
    ).toBeDisabled();
    await page
      .getByRole("textbox", { name: "Message text", exact: true })
      .fill("Your new schedule.");
    await page.getByLabel("I sent this message in WhatsApp").check();
    await page.getByRole("button", { name: "Record as sent manually" }).click();
    await expect(
      page.getByText("Sent manually", { exact: true }),
    ).toBeVisible();
    expect(
      (await db.manualSend.findFirstOrThrow({ where: { memberId: member.id } }))
        .body,
    ).toContain(url);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/file-links-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "artifacts/file-links-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: `Revoke link for ${filename}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Revoke link", exact: true })
      .click();
    await expect(
      page.getByText(
        "Link revoked. Previously shared copies of this link no longer work.",
      ),
    ).toBeVisible();
    expect((await request.get(url)).status()).toBe(404);
    expect(
      (await db.sharedFile.findUniqueOrThrow({ where: { id: fileId } }))
        .content,
    ).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    if (fileId) await db.sharedFile.delete({ where: { id: fileId } });
    await db.manualSend.deleteMany({ where: { memberId: member.id } });
    await db.member.delete({ where: { id: member.id } });
    await db.contact.delete({ where: { id: member.contactId } });
  }
});

test("staff scan member QR images and camera frames with explicit check-in confirmation", async ({
  page,
  browser,
}) => {
  const business = await db.business.findUniqueOrThrow({
    where: { slug: "demo-iron-republic" },
    include: { branches: true, access: true, plans: { take: 1 } },
  });
  const ctx = {
    businessId: business.id,
    branchId: business.branches[0].id,
    userId: business.access.find((a) => a.role === "OWNER")!.userId,
    role: "OWNER" as const,
    support: false,
  };
  const member = await saveMember(ctx, {
    name: `QR Browser ${Date.now()}`,
    phone: "96" + String(Date.now()).slice(-8),
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await db.membership.create({
      data: {
        businessId: business.id,
        branchId: ctx.branchId,
        memberId: member.id,
        planId: business.plans[0].id,
        planName: business.plans[0].name,
        startDate: todayIST(),
        endDate: todayIST(),
      },
    });
    await login(page);
    await page.goto(`/members/${member.id}`);
    await page.getByRole("button", { name: "Member QR", exact: true }).click();
    const qr = page.getByRole("img", {
      name: `Attendance QR for ${member.name}`,
    });
    await expect(qr).toBeVisible();
    const image = (await qr.getAttribute("src"))!;
    const png = Buffer.from(image.split(",")[1], "base64");
    await expect(
      page.getByRole("link", { name: "Download QR", exact: true }),
    ).toHaveAttribute("download", `${member.code}-attendance-qr.png`);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/member-qr-mobile.png",
      fullPage: true,
    });
    await page.goto(`/member-card/${member.id}`);
    await expect(
      page.getByRole("heading", { name: member.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Print card", exact: true }),
    ).toBeVisible();
    const anonymous = await browser.newContext();
    const anonPage = await anonymous.newPage();
    await anonPage.goto(`http://localhost:3000/member-card/${member.id}`);
    await expect(anonPage).toHaveURL(/\/login$/);
    await anonymous.close();

    await login(page, "staff@membrr.local");
    await page.goto("/attendance");
    await page
      .getByRole("button", { name: "Scan member QR", exact: true })
      .click();
    const upload = page.getByLabel("Choose member QR image", { exact: true });
    await upload.setInputFiles({
      name: "member-qr.png",
      mimeType: "image/png",
      buffer: png,
    });
    const dialog = page.getByRole("dialog", {
      name: "Scan member QR",
      exact: true,
    });
    await expect(dialog.getByText(member.name, { exact: true })).toBeVisible();
    expect(await db.checkin.count({ where: { memberId: member.id } })).toBe(0);
    await page.screenshot({
      path: "artifacts/attendance-qr-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Confirm check-in", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "is checked in for today",
    );
    const attendance = await db.checkin.findFirstOrThrow({
      where: { memberId: member.id },
    });
    expect(attendance.source).toBe("QR");
    expect(attendance.recordedBy).toBe(
      business.access.find((a) => a.role === "STAFF")!.userId,
    );
    await upload.setInputFiles({
      name: "member-qr.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(
      dialog.getByText("Already checked in today.", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Confirm check-in" }),
    ).toHaveCount(0);
    expect(await db.checkin.count({ where: { memberId: member.id } })).toBe(1);
    await upload.setInputFiles({
      name: "unrelated.png",
      mimeType: "image/png",
      buffer: await QRCode.toBuffer("https://example.test/unrelated"),
    });
    await expect(dialog.getByRole("alert")).toContainText(
      "not a membrr member QR",
    );
    await upload.setInputFiles({
      name: "blank.png",
      mimeType: "image/png",
      buffer: samplePng,
    });
    await expect(dialog.getByRole("alert")).toContainText(
      "No readable QR found",
    );

    await page.evaluate(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      });
    });
    await dialog
      .getByRole("button", { name: "Start camera", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText("permission denied");
    // Feed real video frames to the decoder without accessing a physical camera.
    await page.evaluate((src) => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 640;
          const context = canvas.getContext("2d")!;
          const picture = new Image();
          picture.src = src;
          await picture.decode();
          const stream = canvas.captureStream(5);
          context.drawImage(picture, 0, 0, 640, 640);
          const timer = setInterval(
            () => context.drawImage(picture, 0, 0, 640, 640),
            200,
          );
          const track = stream.getVideoTracks()[0];
          const stop = track.stop.bind(track);
          track.stop = () => {
            clearInterval(timer);
            stop();
          };
          (window as unknown as { qrTestStream: MediaStream }).qrTestStream =
            stream;
          return stream;
        },
      });
    }, image);
    await dialog
      .getByRole("button", { name: "Start camera", exact: true })
      .click();
    await expect(
      dialog.getByText("Already checked in today.", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { qrTestStream: MediaStream }).qrTestStream
            .getTracks()
            .every((t) => t.readyState === "ended"),
        ),
      )
      .toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "artifacts/attendance-qr-desktop.png",
      fullPage: true,
    });
    await page.evaluate(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 240;
          const context = canvas.getContext("2d")!;
          const media = canvas.captureStream(5);
          context.fillStyle = "white";
          const paint = () => context.fillRect(0, 0, 320, 240);
          paint();
          const timer = setInterval(paint, 200);
          const track = media.getVideoTracks()[0];
          const stop = track.stop.bind(track);
          track.stop = () => {
            clearInterval(timer);
            stop();
          };
          (window as unknown as { qrTestStream: MediaStream }).qrTestStream =
            media;
          return media;
        },
      });
    });
    await dialog
      .getByRole("button", { name: "Start camera", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { qrTestStream: MediaStream }).qrTestStream
            .getTracks()
            .some((t) => t.readyState === "live"),
        ),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { qrTestStream: MediaStream }).qrTestStream
            .getTracks()
            .every((t) => t.readyState === "ended"),
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("link", { name: `${member.name}QR`, exact: true }),
    ).toBeVisible();

    await login(page);
    await page.goto(`/members/${member.id}`);
    await page.getByRole("button", { name: "Member QR", exact: true }).click();
    await expect(qr).toBeVisible();
    await page
      .getByRole("button", { name: "Replace lost QR", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Replace QR now", exact: true })
      .click();
    await expect(qr).toBeVisible();
    await expect(qr).not.toHaveAttribute("src", image);
    await page.goto("/attendance");
    await page
      .getByRole("button", { name: "Scan member QR", exact: true })
      .click();
    await upload.setInputFiles({
      name: "old-member-qr.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.getByRole("alert")).toContainText(
      "not recognized in this business",
    );
    expect(errors).toEqual([]);
  } finally {
    await db.checkin.deleteMany({ where: { memberId: member.id } });
    await db.membership.deleteMany({ where: { memberId: member.id } });
    await db.member.delete({ where: { id: member.id } });
    await db.contact.delete({ where: { id: member.contactId } });
  }
});
