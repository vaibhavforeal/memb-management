import { afterEach, describe, expect, it, vi } from "vitest";
import { validateSharedFile, shareLinkConfig } from "../src/lib/shared-files";
import { messageWithFiles, MAX_FILE_BYTES } from "../src/lib/shared-file-utils";
import { readUpload } from "../src/lib/shared-file-http";
import {
  whatsappLink,
  personalizeMessage,
} from "../src/lib/manual-message-utils";
import {
  samplePng,
  samplePdf,
  sampleDocx,
} from "../scripts/shared-file-fixtures";

afterEach(() => vi.unstubAllEnvs());

describe("shared files", () => {
  it("accepts genuine image, PDF and Word content based on bytes", async () => {
    expect((await validateSharedFile("schedule.PNG", samplePng)).mimeType).toBe(
      "image/png",
    );
    expect((await validateSharedFile("नियम.pdf", samplePdf)).mimeType).toBe(
      "application/pdf",
    );
    expect(
      (await validateSharedFile("schedule.docx", sampleDocx())).mimeType,
    ).toContain("wordprocessingml.document");
  });
  it("rejects HTML disguised as a PDF, mismatched extensions, and unsupported active content", async () => {
    await expect(
      validateSharedFile("fake.pdf", Buffer.from("<script>alert(1)</script>")),
    ).rejects.toThrow("contents");
    await expect(validateSharedFile("image.pdf", samplePng)).rejects.toThrow(
      "contents",
    );
    await expect(validateSharedFile("image.svg", samplePng)).rejects.toThrow(
      "JPG",
    );
    await expect(
      validateSharedFile("script.docm", sampleDocx()),
    ).rejects.toThrow("JPG");
  });
  it("rejects unsafe filenames, empty files and oversized payloads", async () => {
    for (const name of [
      "../rules.pdf",
      "C:\\rules.pdf",
      "rules\r\nX-Test.pdf",
      "rules\u202epdf.pdf",
    ])
      await expect(validateSharedFile(name, samplePdf)).rejects.toThrow(
        "filename",
      );
    await expect(
      validateSharedFile("rules.pdf", Buffer.alloc(0)),
    ).rejects.toThrow("non-empty");
    await expect(
      validateSharedFile("rules.pdf", Buffer.alloc(MAX_FILE_BYTES + 1)),
    ).rejects.toThrow("10 MB");
  });
  it("bounds streamed request bodies even when Content-Length is absent or dishonest", async () => {
    for (const headers of [{}, { "Content-Length": "1" }]) {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array(MAX_FILE_BYTES));
          c.enqueue(new Uint8Array(1));
          c.close();
        },
      });
      const request = new Request("https://club.example/api/shared-files", {
        method: "POST",
        body: stream,
        headers,
        duplex: "half",
      } as RequestInit);
      await expect(readUpload(request)).rejects.toThrow("10 MB");
    }
  });
  it("uses the configured origin and makes local-only links explicit", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    expect(shareLinkConfig().localOnly).toBe(true);
    vi.stubEnv("BETTER_AUTH_URL", "https://club.example.com");
    expect(shareLinkConfig()).toEqual({
      origin: "https://club.example.com",
      localOnly: false,
    });
    vi.stubEnv("BETTER_AUTH_URL", "http://club.example.com");
    expect(() => shareLinkConfig()).toThrow("HTTPS");
    vi.stubEnv("BETTER_AUTH_URL", "https://user:password@club.example.com");
    expect(() => shareLinkConfig()).toThrow("HTTPS");
  });
  it("keeps file URLs and names intact through personalization and WhatsApp URL encoding", () => {
    const file = {
      id: "1",
      name: "Workout {name} & नियम.pdf",
      url: "https://club.example/files/token_with-dash",
      size: 100,
      expiresAt: "2026-11-02T00:00:00.000Z",
    };
    const body = messageWithFiles(
      personalizeMessage("Hi {name}", "Ananya", "Gym"),
      [file],
    );
    expect(
      new URL(whatsappLink("9876543210", body)).searchParams.get("text"),
    ).toBe(`Hi Ananya\n\n${file.name}\n${file.url}`);
  });
});
