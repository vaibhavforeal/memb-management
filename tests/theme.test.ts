import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

const tokens = new Map<string, string>(
  [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [
    m[1],
    m[2].toLowerCase(),
  ]),
);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme tokens", () => {
  const pairs: [string, string][] = [
    ["foreground", "background"],
    ["foreground", "card"],
    ["card-foreground", "card"],
    ["primary-foreground", "primary"],
    ["muted-foreground", "background"],
    ["muted-foreground", "card"],
    ["muted-foreground", "muted"],
    ["accent-foreground", "accent"],
    ["destructive", "card"],
    ["primary", "background"],
    ["primary", "card"],
  ];

  it.each(pairs)("%s on %s meets WCAG AA", (fg, bg) => {
    expect(tokens.has(fg), `missing token ${fg}`).toBe(true);
    expect(tokens.has(bg), `missing token ${bg}`).toBe(true);
    expect(contrast(tokens.get(fg)!, tokens.get(bg)!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("is a light theme", () => {
    expect(luminance(tokens.get("background")!)).toBeGreaterThan(0.8);
    expect(readFileSync("src/app/layout.tsx", "utf8")).not.toMatch(
      /className="dark"/,
    );
  });

  it("defines the brand gradients", () => {
    expect(css).toContain(
      "--brand-gradient: linear-gradient(135deg, #0b1f4b 0%, #1e3a8a 45%, #2563eb 100%)",
    );
    expect(css).toContain(
      "--brand-gradient-soft: linear-gradient(135deg, #1e40af, #2563eb)",
    );
    expect(css).toContain(
      "--sidebar-gradient: linear-gradient(180deg, #0b1f4b, #102a63)",
    );
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(entry.name) &&
      entry.name !== "member-document.css"
      ? [path]
      : [];
  });
}

// Light-on-navy accents are intentional on navy surfaces: sidebar, wordmark,
// login panel, landing hero and closing CTA band.
const onNavy = (file: string, line: string) =>
  /(?:shell|wordmark|login[\\/]page|landing[\\/](?:hero|cta-band))\.tsx$/.test(
    file,
  ) && /sky-300/.test(line);

describe("light theme source guard", () => {
  it("has no dark-only palette classes or colors left in src", () => {
    const banned =
      /(?:(?:text|bg)-(?:amber|sky|emerald|rose|green|yellow)-(?:100|200|300|400)\b|#(?:b6f09c|151a18|151d17|101413|191f1c|202824|2d3731))/i;
    const hits = sourceFiles("src").flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          banned.test(line) && !onNavy(file, line)
            ? [`${file}:${i + 1}: ${line.trim()}`]
            : [],
        ),
    );
    expect(hits).toEqual([]);
  });

  it("status badge pairs use dark text on pale tints", () => {
    const badge = readFileSync("src/components/ui/badge.tsx", "utf8");
    for (const [, , shade] of badge.matchAll(
      /text-(amber|sky|emerald)-(\d+)/g,
    )) {
      expect(Number(shade)).toBeGreaterThanOrEqual(700);
    }
    for (const [, , shade] of badge.matchAll(/bg-(amber|sky|emerald)-(\d+)/g)) {
      expect(Number(shade)).toBeLessThanOrEqual(100);
    }
  });
});

function layerBlock(name: string) {
  const start = css.indexOf(`@layer ${name} {`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return "";
}

describe("cascade layers", () => {
  it("keeps global resets in @layer base so utilities can override them", () => {
    const base = layerBlock("base");
    expect(base).toContain("border-color: var(--color-border)");
    expect(base).toContain(":focus-visible");
  });

  it("keeps component classes in @layer components", () => {
    const components = layerBlock("components");
    for (const selector of [
      ".data-table td",
      ".eyebrow",
      ".field",
      ".subtle-grid",
    ])
      expect(components, selector).toContain(selector);
  });

  it("keeps brand gradient utilities in @layer utilities", () => {
    const utilities = layerBlock("utilities");
    for (const name of [".bg-brand-gradient", ".bg-sidebar-gradient"])
      expect(utilities, name).toContain(name);
  });

  it("opts in to Next.js smooth-scroll handling on <html>", () => {
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain(
      'data-scroll-behavior="smooth"',
    );
  });
});
