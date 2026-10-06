import "dotenv/config";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";
import { ensureLocalTest } from "./test-support";

async function main() {
  ensureLocalTest();
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = (probe.address() as import("node:net").AddressInfo).port;
  await new Promise<void>((done) => probe.close(() => done()));
  const baseURL = `http://localhost:${port}`;
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    BETTER_AUTH_URL: baseURL,
    E2E_BASE_URL: baseURL,
    BILLING_E2E_PROVIDER: "simulated",
    RAZORPAY_KEY_ID: "rzp_test_browserfixture",
    RAZORPAY_KEY_SECRET: "browser-fixture-secret",
    RAZORPAY_WEBHOOK_SECRET: "browser-fixture-webhook",
  };
  const server = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(resolve("scripts/razorpay-test-provider.mjs")).href,
      resolve(".next/standalone/server.js"),
    ],
    { env, stdio: "inherit", windowsHide: true },
  );
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      if (server.exitCode !== null)
        throw new Error("Billing test server exited before startup.");
      try {
        ready = (
          await fetch(`${baseURL}/api/health`, {
            signal: AbortSignal.timeout(2000),
          })
        ).ok;
      } catch {
        /* server starting */
      }
      if (ready) break;
      await setTimeout(250);
    }
    if (!ready)
      throw new Error(
        "Billing test server did not become ready. Run npm run build first.",
      );
    const runner = spawn(
      process.execPath,
      [
        resolve("node_modules/@playwright/test/cli.js"),
        "test",
        "e2e/billing.spec.ts",
      ],
      { env, stdio: "inherit", windowsHide: true },
    );
    const [code] = await once(runner, "exit");
    process.exitCode = code ?? 1;
  } finally {
    server.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
