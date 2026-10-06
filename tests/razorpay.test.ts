import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BillingError,
  razorpayAvailable,
  razorpayRequest,
  validRazorpaySignature,
} from "../src/lib/razorpay";
import { readBillingBody, billingFailure } from "../src/lib/billing-http";
import { renewalStart, termEnd, todayIST } from "../src/lib/domain";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Razorpay billing boundaries", () => {
  it("requires complete credentials and a separate webhook secret", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_example");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "example-secret");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    expect(razorpayAvailable()).toBe(false);
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "webhook-secret");
    expect(razorpayAvailable()).toBe(true);
  });
  it("authenticates exact raw bytes and rejects malformed or altered signatures", () => {
    const raw = Buffer.from('{ "event": "payment.captured" }');
    const signature = createHmac("sha256", "secret").update(raw).digest("hex");
    expect(validRazorpaySignature(raw, signature, "secret")).toBe(true);
    for (const bad of [
      null,
      "",
      signature + "zz",
      "0".repeat(64),
      signature.slice(2),
    ])
      expect(validRazorpaySignature(raw, bad, "secret")).toBe(false);
    expect(
      validRazorpaySignature(
        '{"event":"payment.captured"}',
        signature,
        "secret",
      ),
    ).toBe(false);
    expect(validRazorpaySignature(raw, signature, "other-secret")).toBe(false);
  });
  it("bounds streamed webhook bodies without trusting Content-Length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(20));
        c.enqueue(new Uint8Array(1));
        c.close();
      },
    });
    const request = new Request("https://club.test/api/webhooks/razorpay", {
      method: "POST",
      body: stream,
      headers: { "Content-Length": "1" },
      duplex: "half",
    } as RequestInit);
    await expect(readBillingBody(request, 20)).rejects.toThrow("too large");
  });
  it("keeps provider errors and credentials out of HTTP responses", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_example");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "example-secret");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "webhook-secret");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":"private-details"}', { status: 401 }),
        ),
    );
    await expect(razorpayRequest("orders")).rejects.toThrow(
      "Razorpay is unavailable",
    );
    expect(
      JSON.stringify(await billingFailure(new Error("private-details")).json()),
    ).not.toContain("private-details");
    expect(billingFailure(new BillingError("Forbidden", 403)).status).toBe(403);
  });
  it("starts late renewals today and extends early renewals with calendar month clamping", () => {
    const today = todayIST(new Date("2026-01-30T20:00:00Z"));
    expect(today.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(renewalStart(new Date("2025-12-31"), today)).toEqual(today);
    expect(termEnd(today, 1).toISOString().slice(0, 10)).toBe("2026-02-27");
    expect(
      renewalStart(new Date("2026-02-27"), today).toISOString().slice(0, 10),
    ).toBe("2026-02-28");
  });
});
