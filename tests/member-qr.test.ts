import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { memberQrPayload, parseMemberQr } from "../src/lib/member-qr-format";

describe("member QR cards", () => {
  it("decodes a range of generated card patterns, including rotated images", async () => {
    for (let i = 0; i < 40; i++) {
      const token = createHash("sha256")
        .update(`qr-decoder-regression-${i}`)
        .digest("base64url");
      const payload = memberQrPayload(token);
      const png = PNG.sync.read(
        await QRCode.toBuffer(payload, {
          width: 640,
          margin: 4,
          errorCorrectionLevel: "M",
        }),
      );
      const data = new Uint8ClampedArray(png.data);
      expect(jsQR(data, png.width, png.height)?.data, `card ${i}`).toBe(
        payload,
      );
      if (i % 10 === 0) {
        const rotated = new Uint8ClampedArray(data.length);
        for (let y = 0; y < png.height; y++)
          for (let x = 0; x < png.width; x++) {
            const from = (y * png.width + x) * 4;
            const to = (x * png.height + (png.height - y - 1)) * 4;
            rotated.set(data.subarray(from, from + 4), to);
          }
        expect(jsQR(rotated, png.height, png.width)?.data).toBe(payload);
      }
    }
  }, 20000);

  it("accepts only the member QR format", () => {
    const token = "a".repeat(43);
    expect(parseMemberQr(memberQrPayload(token))).toBe(token);
    for (const raw of [
      "",
      "https://example.test/",
      token,
      memberQrPayload(token) + "x",
      "clubhouse:member:bad",
    ]) {
      expect(parseMemberQr(raw)).toBeNull();
    }
  });
});
