import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { providerSend, DeliveryError } from "../src/lib/whatsapp";
import { encrypt } from "../src/lib/security";
beforeEach(() => vi.stubEnv("WHATSAPP_MODE", "cloud"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Meta send boundary", () => {
  const prepare = () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "cd".repeat(32);
    return encrypt("unit-test-access-token");
  };
  it("sends mapped positional parameters and a reconciliation ID", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", request);
    const id = await providerSend(
      "123456",
      prepare(),
      "+919876543210",
      { name: "renewal", language: "en" },
      ["Ananya", "2 Oct"],
      "local-message-id",
    );
    expect(id).toBe("wamid.test");
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.to).toBe("919876543210");
    expect(body.biz_opaque_callback_data).toBe("local-message-id");
    expect(body.template.components[0].parameters).toEqual([
      { type: "text", text: "Ananya" },
      { type: "text", text: "2 Oct" },
    ]);
  });
  it.each([
    [429, 130429, "retry"],
    [400, 132000, "failed"],
    [500, 1, "unknown"],
  ])(
    "classifies HTTP %s without unsafe retries",
    async (status, code, outcome) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: { code } }), {
            status: Number(status),
          }),
        ),
      );
      await expect(
        providerSend(
          "123456",
          prepare(),
          "+919876543210",
          { name: "test", language: "en" },
          [],
          "local-id",
        ),
      ).rejects.toMatchObject({ outcome });
    },
  );
  it("does not treat a network timeout as a confirmed rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(
      providerSend(
        "123456",
        prepare(),
        "+919876543210",
        { name: "test", language: "en" },
        [],
        "local-id",
      ),
    ).rejects.toMatchObject({ outcome: "unknown" });
  });
});
