import { createHmac, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { cleanup, ensureLocalTest, fixture } from "../scripts/test-support";
import { acceptInvitation } from "../src/lib/admin";
import { hashToken, secretToken } from "../src/lib/security";

test.skip(
  process.env.BILLING_E2E_PROVIDER !== "simulated",
  "Run against the isolated simulated Razorpay server described in docs/RAZORPAY_VERIFICATION.md.",
);
let owner: Awaited<ReturnType<typeof fixture>>;
let staff: Awaited<ReturnType<typeof fixture>>;
const password = "BillingBrowser!2026";
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3001";
const sessions = new Map<
  string,
  Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>>
>();
test.beforeAll(async () => {
  ensureLocalTest();
  owner = await fixture("itest");
  staff = await fixture("itest");
  owner.b.name = `Billing ${owner.b.slug}`;
  await db.business.update({
    where: { id: owner.b.id },
    data: { name: owner.b.name, monthlyFeePaise: 149950 },
  });
  const hashed = await hashPassword(password);
  for (const f of [owner, staff])
    await db.account.create({
      data: {
        id: randomUUID(),
        accountId: f.user.id,
        userId: f.user.id,
        providerId: "credential",
        password: hashed,
      },
    });
  await db.user.update({
    where: { id: owner.user.id },
    data: { platformAdmin: true },
  });
  await db.staffAccess.update({
    where: {
      businessId_userId: { businessId: staff.b.id, userId: staff.user.id },
    },
    data: { role: "STAFF" },
  });
});
test.afterAll(async () => {
  if (owner) await cleanup(owner.b.id);
  if (staff) await cleanup(staff.b.id);
  await db.$disconnect();
});

async function signIn(
  page: import("@playwright/test").Page,
  email = owner.user.email,
) {
  const existing = sessions.get(email);
  if (existing) {
    await page.context().addCookies(existing);
    return;
  }
  const response = await page.request.post(
    `${baseURL}/api/auth/sign-in/email`,
    {
      data: { email, password },
      // Model independent clients so separate fixture users do not share a login limit.
      headers: {
        Origin: baseURL,
        "x-forwarded-for": `2001:db8::${randomUUID().slice(0, 4)}`,
      },
    },
  );
  expect(response.status()).toBe(200);
  sessions.set(email, await page.context().cookies());
}

async function checkoutScript(
  page: import("@playwright/test").Page,
  behavior: "pay" | "dismiss" | "fail" = "pay",
) {
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Razorpay = class {
      constructor(options) { this.options = options; window.billingTestOptions = options; }
      on(event, handler) { this.failure = handler; }
      async open() {
        const o = this.options;
        if (${JSON.stringify(behavior)} === "dismiss") { o.modal.ondismiss(); return; }
        if (${JSON.stringify(behavior)} === "fail") { this.failure(); o.modal.ondismiss(); return; }
        const paymentId = o.order_id.replace("order_", "pay_");
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", encoder.encode("browser-fixture-secret"), {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
        const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(o.order_id + "|" + paymentId));
        const signature = Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
        o.handler({razorpay_order_id:o.order_id, razorpay_payment_id:paymentId, razorpay_signature:signature});
      }
    };`,
    }),
  );
}

test("admin fee → owner checkout → verified payment → idempotent signed webhook", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await db.business.update({
    where: { id: owner.b.id },
    data: { monthlyFeePaise: 150000 },
  });
  expect(
    (
      await page.request.post("/api/billing/orders", {
        headers: { Origin: "https://another-site.example" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/admin");
  const card = page.locator("section").filter({
    has: page.getByRole("heading", { name: owner.b.name, exact: true }),
  });
  await card.getByRole("button", { name: "Configure billing" }).click();
  await page.getByLabel("Monthly fee (₹)").fill("1499.50");
  await page.getByRole("button", { name: "Save monthly fee" }).click();
  await expect(page.getByText("Workspace updated.")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await db.business.findUniqueOrThrow({ where: { id: owner.b.id } }))
          .monthlyFeePaise,
    )
    .toBe(149950);
  await checkoutScript(page);
  await page.goto("/billing");
  await expect(
    page.getByRole("heading", { name: "Business billing" }),
  ).toBeVisible();
  await expect(
    page.getByText("Test mode — no real money will be charged."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pay ₹1,499.50 for one month" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Payment confirmed. Your monthly billing period has been renewed.",
  );
  const order = await db.businessBillingOrder.findFirstOrThrow({
    where: { businessId: owner.b.id, paidAt: { not: null } },
  });
  expect(order.amountPaise).toBe(149950);
  await expect(
    page.getByText(order.razorpayPaymentId!, { exact: true }),
  ).toBeVisible();
  const payload = JSON.stringify({
    event: "order.paid",
    payload: {
      payment: {
        entity: {
          id: order.razorpayPaymentId,
          order_id: order.razorpayOrderId,
          amount: order.amountPaise,
          currency: "INR",
          status: "captured",
          captured: true,
          amount_refunded: 0,
        },
      },
    },
  });
  const signature = createHmac("sha256", "browser-fixture-webhook")
    .update(payload)
    .digest("hex");
  for (let i = 0; i < 2; i++) {
    const response = await page.request.post("/api/webhooks/razorpay", {
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
      },
    });
    expect(response.status()).toBe(200);
  }
  expect(
    await db.auditLog.count({
      where: { businessId: owner.b.id, action: "BUSINESS_BILLING_PAID" },
    }),
  ).toBe(1);
  await page.screenshot({ path: ".local/billing-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/billing-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("dismissed checkout stays unpaid and can be reconciled after a lost callback", async ({
  page,
}) => {
  await signIn(page);
  await checkoutScript(page, "dismiss");
  await page.goto("/billing");
  await page
    .getByRole("button", { name: "Pay ₹1,499.50 for one month" })
    .click();
  await expect(page.getByRole("status")).toContainText("Checkout closed");
  await page.getByRole("button", { name: "Check payment status" }).click();
  await expect(page.getByRole("status")).toContainText("not captured yet");
  const unpaid = await db.businessBillingOrder.findFirstOrThrow({
    where: { businessId: owner.b.id, paidAt: null },
  });
  // Simulate an authentic captured webhook arriving after the owner closed their browser.
  const payload = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: unpaid.razorpayOrderId.replace("order_", "pay_"),
          order_id: unpaid.razorpayOrderId,
          amount: unpaid.amountPaise,
          currency: "INR",
          status: "captured",
          captured: true,
          amount_refunded: 0,
        },
      },
    },
  });
  const response = await page.request.post("/api/webhooks/razorpay", {
    data: payload,
    headers: {
      "x-razorpay-signature": createHmac("sha256", "browser-fixture-webhook")
        .update(payload)
        .digest("hex"),
    },
  });
  expect(response.status()).toBe(200);
  await page.getByRole("button", { name: "Check payment status" }).click();
  await expect(page.getByRole("status")).toContainText("Payment confirmed");
});

test("script errors and failed attempts remain recoverable", async ({
  page,
}) => {
  await signIn(page);
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.abort(),
  );
  await page.goto("/billing");
  await expect(
    page.getByRole("alert").filter({ hasText: "Checkout could not load" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pay ₹1,499.50 for one month" }),
  ).toBeDisabled();
  await page.unroute("https://checkout.razorpay.com/v1/checkout.js");
  await checkoutScript(page, "fail");
  await page.reload();
  await page
    .getByRole("button", { name: "Pay ₹1,499.50 for one month" })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Checkout closed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Check payment status" }),
  ).toBeEnabled();
});

test("staff, unauthenticated callers, cross-origin requests and forged webhooks are denied", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.post("/api/billing/orders", {
        headers: { Origin: baseURL },
      })
    ).status(),
  ).toBe(403);
  await signIn(page, staff.user.email);
  await page.goto("/billing");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("link", { name: "Business billing" }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/billing/orders", {
        headers: { Origin: baseURL },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/billing/orders", {
        headers: { Origin: "https://another-site.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/webhooks/razorpay", {
        data: "{}",
        headers: { "x-razorpay-signature": "0".repeat(64) },
      })
    ).status(),
  ).toBe(400);
});

test("public signup → 72-hour trial → blocked features → ₹499 payment restores access", async ({
  page,
}) => {
  const email = `itest-trial-${randomUUID()}@example.test`;
  let businessId: string | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/login");
    await page
      .getByRole("link", { name: "Start a three-day free trial" })
      .click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByText(/₹499 per month/)).toBeVisible();
    await page.getByLabel("Your name", { exact: true }).fill("Trial owner");
    await page.getByLabel("Email address").fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByLabel("Workspace name").fill("itest Trial workspace");
    await page.getByLabel("City", { exact: true }).fill("Bengaluru");
    await page.getByRole("button", { name: "Start free trial" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Three-day free trial" }),
    ).toBeVisible();
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const access = await db.staffAccess.findFirstOrThrow({
      where: { userId: user.id },
      include: { business: true },
    });
    businessId = access.businessId;
    expect(access.role).toBe("OWNER");
    expect(user.platformAdmin).toBe(false);
    expect(access.business.monthlyFeePaise).toBe(49900);
    expect(access.business.trialRequired).toBe(true);
    expect(
      access.business.trialEndsAt!.getTime() - user.createdAt.getTime(),
    ).toBe(72 * 60 * 60 * 1000);
    expect(await db.branch.count({ where: { businessId } })).toBe(1);
    const duplicate = await page.request.post("/api/signup", {
      headers: { Origin: baseURL },
      data: {
        name: "Duplicate",
        email,
        password,
        businessName: "itest Duplicate",
        city: "Pune",
      },
    });
    expect(duplicate.status()).toBe(409);
    expect(await db.staffAccess.count({ where: { userId: user.id } })).toBe(1);

    // Submit a feature form loaded while the trial was still active.
    await page.goto("/members/new");
    const expiredAt = new Date(Date.now() - 1000);
    await db.business.update({
      where: { id: businessId },
      data: { trialEndsAt: expiredAt },
    });
    await page.locator('input[name="name"]').fill("Blocked member");
    await page.locator('input[name="phone"]').fill("9876543210");
    await page.getByRole("button", { name: "Create member" }).click();
    await expect(page).toHaveURL(/\/upgrade$/);
    expect(await db.member.count({ where: { businessId } })).toBe(0);
    await expect(
      page.getByRole("heading", { name: "Your three-day trial has ended" }),
    ).toBeVisible();
    for (const path of [
      "/dashboard",
      "/members",
      "/plans",
      "/payments",
      "/attendance",
      "/whatsapp",
      "/settings",
      "/members/import",
      "/members/new",
      "/receipts/any",
      "/member-card/any",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/upgrade$/);
    }
    for (const path of ["/api/members/export", "/api/shared-files"]) {
      const denied = await page.request.get(path);
      expect(denied.status()).toBe(402);
      expect((await denied.json()).upgradeUrl).toBe("/upgrade");
    }
    const upload = await page.request.post("/api/shared-files", {
      headers: { Origin: baseURL },
      data: "blocked",
    });
    expect(upload.status()).toBe(402);

    // Later staff and owner invitations cannot restart an expired workspace trial.
    for (const role of ["STAFF", "OWNER"]) {
      const token = secretToken();
      const inviteEmail = `itest-${role.toLowerCase()}-${randomUUID()}@example.test`;
      await db.invitation.create({
        data: {
          businessId,
          name: role,
          email: inviteEmail,
          role,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await acceptInvitation(token, password);
      expect(
        (await db.business.findUniqueOrThrow({ where: { id: businessId } }))
          .trialEndsAt,
      ).toEqual(expiredAt);
      if (role === "STAFF") {
        const staffContext = await page
          .context()
          .browser()!
          .newContext({ baseURL });
        try {
          const staffPage = await staffContext.newPage();
          await signIn(staffPage, inviteEmail);
          await staffPage.goto("/dashboard");
          await expect(staffPage).toHaveURL(/\/upgrade$/);
          await expect(
            staffPage.getByText(/Contact your workspace owner/),
          ).toBeVisible();
          expect(
            (
              await staffPage.request.post("/api/billing/orders", {
                headers: { Origin: baseURL },
              })
            ).status(),
          ).toBe(403);
        } finally {
          await staffContext.close();
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/trial-expired-mobile.png",
      fullPage: true,
    });
    await checkoutScript(page);
    await page.getByRole("link", { name: "Go to paid plan" }).click();
    await expect(page).toHaveURL(/\/billing$/);
    await page.getByRole("button", { name: "Pay ₹499 for one month" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Payment confirmed. Your monthly billing period has been renewed.",
    );
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Three-day free trial" }),
    ).toHaveCount(0);
    await page.goto("/members");
    await expect(page).toHaveURL(/\/members$/);
    expect((await page.request.get("/api/members/export")).status()).toBe(200);
    expect(
      (await db.business.findUniqueOrThrow({ where: { id: businessId } }))
        .billingPaidThrough,
    ).not.toBeNull();
    expect(errors).toEqual([]);
  } finally {
    if (!businessId)
      businessId = (
        await db.staffAccess.findFirst({ where: { user: { email } } })
      )?.businessId;
    if (businessId) await cleanup(businessId);
  }
});
