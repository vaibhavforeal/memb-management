import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { ensureLocalTest } from "./test-support";
async function run(exe: string, args: string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((ok, fail) => {
    const p = spawn(exe, args, {
      env,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let error = "";
    p.stderr.on("data", (d) => {
      error += String(d);
    });
    p.on("error", fail);
    p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(error))));
  });
}
async function signatures(c: Client) {
  const tables = (
    await c.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  const result = [];
  for (const { tablename } of tables) {
    const identifier = '"' + tablename.replaceAll('"', '""') + '"';
    const r = await c.query(
      `SELECT COUNT(*)::int count, md5(COALESCE(string_agg(md5(convert_to(row_to_json(t)::text, 'UTF8')), '' ORDER BY md5(convert_to(row_to_json(t)::text, 'UTF8'))), '')) checksum FROM ${identifier} t`,
    );
    result.push({ table: tablename, ...r.rows[0] });
  }
  return result;
}
async function main() {
  ensureLocalTest();
  const url = new URL(process.env.DATABASE_URL!);
  const source = new Client({ connectionString: url.toString() });
  await source.connect();
  try {
    if (
      (await source.query("SHOW server_encoding")).rows[0].server_encoding ===
      "UTF8"
    ) {
      console.info("The local database already uses UTF-8.");
      return;
    }
    const target = url.pathname.slice(1) + "_utf8";
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(target))
      throw new Error("Invalid database target");
    const dump = resolve(".local", `encoding-${randomUUID()}.dump`);
    const tools = resolve(".local/tools/pgsql/bin");
    const env = {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port,
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: url.pathname.slice(1),
    };
    const before = await signatures(source);
    if (
      !(
        await source.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          target,
        ])
      ).rowCount
    ) {
      await run(
        resolve(tools, "pg_dump.exe"),
        [
          "--format=custom",
          "--encoding=UTF8",
          "--no-owner",
          "--no-acl",
          `--file=${dump}`,
        ],
        env,
      );
      await source.query(
        `CREATE DATABASE "${target}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
      );
      await run(
        resolve(tools, "pg_restore.exe"),
        [
          "--exit-on-error",
          "--no-owner",
          "--no-acl",
          `--dbname=${target}`,
          dump,
        ],
        env,
      );
    }
    const nextUrl = new URL(url);
    nextUrl.pathname = "/" + target;
    const next = new Client({ connectionString: nextUrl.toString() });
    await next.connect();
    try {
      assert.deepEqual(await signatures(next), before);
      assert.equal(
        (await next.query("SELECT $1::text AS value", ["₹ नमस्ते"])).rows[0]
          .value,
        "₹ नमस्ते",
      );
      const environment = readFileSync(".env", "utf8");
      assert(/^DATABASE_URL=.*$/m.test(environment));
      writeFileSync(
        ".env",
        environment.replace(
          /^DATABASE_URL=.*$/m,
          () => `DATABASE_URL=${nextUrl}`,
        ),
        { mode: 0o600 },
      );
      if (existsSync(dump)) unlinkSync(dump);
      console.info(
        `UTF-8 migration complete. ${before.length} application tables match by row counts and content checksums. Unicode round-trip passed. The original database is retained; .env now points to the verified UTF-8 copy.`,
      );
    } finally {
      await next.end();
    }
  } finally {
    await source.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
