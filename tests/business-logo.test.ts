import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareBusinessLogo } from "../src/lib/business-logo";
import { readLogoUpload } from "../src/lib/business-logo-http";
import { MAX_LOGO_BYTES } from "../src/lib/business-logo-utils";

const image = () =>
  sharp({
    create: { width: 1500, height: 750, channels: 4, background: "#00aa88" },
  });

describe("business logo uploads", () => {
  it("decodes PNG, JPG, and WebP, resizes without cropping, and removes metadata", async () => {
    for (const format of ["png", "jpeg", "webp"] as const) {
      const input = await image().withMetadata().toFormat(format).toBuffer();
      const output = await prepareBusinessLogo(input);
      const metadata = await sharp(output).metadata();
      expect(metadata.format).toBe("webp");
      expect([metadata.width, metadata.height]).toEqual([1024, 512]);
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
    }
  });

  it("rejects active content, corrupt images, oversized files and excessive dimensions", async () => {
    await expect(
      prepareBusinessLogo(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      ),
    ).rejects.toThrow("PNG");
    const valid = await image().png().toBuffer();
    await expect(prepareBusinessLogo(valid.subarray(0, 40))).rejects.toThrow(
      "could not be read",
    );
    await expect(prepareBusinessLogo(Buffer.alloc(0))).rejects.toThrow(
      "Choose a logo",
    );
    await expect(
      prepareBusinessLogo(Buffer.alloc(MAX_LOGO_BYTES + 1)),
    ).rejects.toThrow("2 MB");
    const wide = await sharp({
      create: { width: 4097, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(prepareBusinessLogo(wide)).rejects.toThrow("4096");
  });

  it("bounds the upload stream when content length is absent or false", async () => {
    for (const headers of [{}, { "Content-Length": "1" }]) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_LOGO_BYTES));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      });
      const request = new Request("https://example.test/api/business/logo", {
        method: "POST",
        body,
        headers,
        duplex: "half",
      } as RequestInit);
      await expect(readLogoUpload(request)).rejects.toThrow("2 MB");
    }
  });
});
