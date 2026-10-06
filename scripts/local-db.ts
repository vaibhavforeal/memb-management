import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import EmbeddedPostgres from "embedded-postgres";

// Resolve on "exit", not "close": the server pg_ctl starts inherits its stderr
// and keeps the pipe open for as long as it runs.
function run(file: string, args: string[]) {
  return new Promise<void>((resolveRun, reject) => {
    const child = spawn(file, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      child.stderr.destroy();
      if (code === 0) resolveRun();
      else reject(new Error(stderr.trim() || `exit code ${code}`));
    });
  });
}

async function main() {
  if (!existsSync(".env")) {
    const password = randomBytes(20).toString("hex");
    writeFileSync(
      ".env",
      `DATABASE_URL=postgresql://clubhouse:${password}@127.0.0.1:54329/clubhouse\nBETTER_AUTH_URL=http://localhost:3000\nBETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\nCREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nMETA_WEBHOOK_VERIFY_TOKEN=${randomBytes(24).toString("hex")}\nMETA_APP_SECRET=${randomBytes(32).toString("hex")}\nMETA_GRAPH_VERSION=v25.0\nWHATSAPP_DRY_RUN=true\nALLOW_LOCAL_EMAIL_LOG=true\nSEED_DEMO=true\n`,
      { mode: 0o600 },
    );
    console.info(
      "Created a local .env with randomly generated development secrets.",
    );
  }
  config();
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Local database runner requires a loopback DATABASE_URL.");
  mkdirSync(".local", { recursive: true });
  const databaseDir = resolve(".local/postgres");
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port: Number(url.port),
    persistent: true,
    authMethod: "scram-sha-256",
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: (m: unknown) => {
      const s = String(m);
      if (/ERROR|FATAL/.test(s)) console.error(s);
    },
  });
  if (!existsSync(resolve(databaseDir, "PG_VERSION"))) await pg.initialise();
  let stopServer = () => pg.stop();
  if (process.platform === "win32") {
    // embedded-postgres runs postgres.exe directly, which PostgreSQL refuses in
    // an Administrator terminal, and stops it with a forced taskkill. pg_ctl
    // drops administrator rights itself and shuts down cleanly.
    const { pg_ctl } = await import("@embedded-postgres/windows-x64");
    const log = resolve(".local/postgres.log");
    const ctl = (...args: string[]) =>
      run(pg_ctl, ["-D", databaseDir, "-w", ...args]).catch((error) => {
        throw new Error(
          `pg_ctl ${args[0]} failed; see ${log}.\n${error.message}`,
        );
      });
    // A server left behind by a closed terminal cannot start new backends on
    // Windows, so restart it from this terminal instead of reusing it.
    const running = await run(pg_ctl, ["-D", databaseDir, "status"]).then(
      () => true,
      () => false,
    );
    if (running) await ctl("stop", "-m", "fast");
    await ctl("start", "-l", log, "-o", `-p ${url.port} -h 127.0.0.1`);
    stopServer = () => ctl("stop", "-m", "fast");
    // pg_ctl detaches the server; keep this process alive until Ctrl+C.
    setInterval(() => {}, 1 << 30);
  } else await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  const name = url.pathname.slice(1);
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(name))
    throw new Error("Choose a simple local database name.");
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [name],
  );
  if (!exists.rowCount)
    await client.query(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
  await client.end();
  console.info(
    `PostgreSQL ready on 127.0.0.1:${url.port}. Keep this process running.`,
  );
  const stop = async () => {
    await stopServer();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
