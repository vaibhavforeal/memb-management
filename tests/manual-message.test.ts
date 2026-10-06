import { afterEach, describe, expect, it, vi } from "vitest";
import {
  whatsappLink,
  personalizeMessage,
} from "../src/lib/manual-message-utils";
import { manualWhatsApp } from "../src/lib/whatsapp-mode";
import { providerSend } from "../src/lib/whatsapp";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("manual WhatsApp", () => {
  it("uses manual mode unless cloud is explicitly selected", () => {
    vi.stubEnv("WHATSAPP_MODE", "");
    expect(manualWhatsApp()).toBe(true);
    vi.stubEnv("WHATSAPP_MODE", "invalid");
    expect(manualWhatsApp()).toBe(true);
    vi.stubEnv("WHATSAPP_MODE", "cloud");
    expect(manualWhatsApp()).toBe(false);
  });
  it("encodes Indian phone numbers, newlines and special characters in the chat link", () => {
    const text = "Hi Ananya!\n₹1,500 due & a 10% discount? नमस्ते";
    const url = new URL(whatsappLink("98765 43210", text));
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/919876543210");
    expect(url.searchParams.get("text")).toBe(text);
  });
  it("personalizes supported fields without interpreting member text as another placeholder", () => {
    expect(
      personalizeMessage(
        "Hi {name}, welcome to {business}.",
        "Member {business}",
        "Club",
      ),
    ).toBe("Hi Member {business}, welcome to Club.");
  });
  it("blocks the provider boundary in manual mode before any network request", async () => {
    vi.stubEnv("WHATSAPP_MODE", "manual");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(
      providerSend(
        "12345",
        "not-a-credential",
        "+919876543210",
        { name: "test", language: "en" },
        [],
        "test",
      ),
    ).rejects.toThrow("Manual WhatsApp");
    expect(request).not.toHaveBeenCalled();
  });
});
