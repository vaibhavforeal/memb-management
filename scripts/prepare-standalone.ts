import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const output = resolve(".next/standalone");
if (!existsSync(resolve(output, "server.js")))
  throw new Error("Build the Next.js standalone output first.");
mkdirSync(resolve(output, ".next"), { recursive: true });
cpSync(resolve(".next/static"), resolve(output, ".next/static"), {
  recursive: true,
});
cpSync(resolve("public"), resolve(output, "public"), { recursive: true });
console.info(
  "Standalone server prepared with public assets and compiled styles.",
);
