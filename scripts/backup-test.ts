import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, sep } from "node:path";
import { Client } from "pg";
import { ensureLocalTest, fixture, cleanup } from "./test-support";
import { uploadSharedFile } from "../src/lib/shared-files";
import { db } from "../src/lib/db";
import { samplePng } from "./shared-file-fixtures";

async function run(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input?: Buffer,
) {
  return new Promise<string>((ok, fail) => {
    const p = spawn(executable, args, {
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      errors = "";
    p.stdout.on("data", (d) => (output += String(d)));
    p.stderr.on("data", (d) => (errors += String(d)));
    p.on("error", fail);
    p.on("close", (code) =>
      code === 0
        ? ok(output)
        : fail(
            new Error(`${executable.split(/[\\/]/).pop()} failed: ${errors}`),
          ),
    );
    p.stdin.end(input);
  });
}
async function main() {
  ensureLocalTest();
  const url = new URL(process.env.DATABASE_URL!);
  const localRoot = resolve(".local");
  const work = resolve(localRoot, `backup-drill-${randomUUID()}`);
  if (!work.startsWith(localRoot + sep))
    throw new Error("Invalid scratch path");
  mkdirSync(work, { recursive: true });
  const restic =
    process.env.RESTIC_BINARY ||
    resolve(".local/tools/restic/restic_0.19.1_windows_amd64.exe");
  const pgBin = process.env.PG_BIN || resolve(".local/tools/pgsql/bin");
  const extension = process.platform === "win32" ? ".exe" : "";
  if (!existsSync(restic))
    throw new Error(
      "Set RESTIC_BINARY to your verified restic executable before running the backup drill.",
    );
  const target = `clubhouse_restore_${randomUUID().replaceAll("-", "")}`;
  if (
    !/^clubhouse_restore_[a-f0-9]{32}$/.test(target) ||
    target === url.pathname.slice(1)
  )
    throw new Error("Unsafe restore database name");
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
    RESTIC_REPOSITORY: resolve(work, "encrypted-repository"),
    RESTIC_PASSWORD: randomBytes(32).toString("hex"),
  };
  const source = new Client({ connectionString: process.env.DATABASE_URL });
  await source.connect();
  let created = false;
  let fileFixture: Awaited<ReturnType<typeof fixture>> | undefined;
  const fileSummarySql = `SELECT COUNT(*)::int files, md5(string_agg(id || name || "tokenHash" || "encryptedToken" || "expiresAt"::text || COALESCE("revokedAt"::text,'') || COALESCE(md5(content),''), '' ORDER BY id)) checksum FROM "SharedFile"`;
  try {
    fileFixture = await fixture("backup-test");
    await uploadSharedFile(fileFixture.ctx, "restored-schedule.png", samplePng);
    const filesBefore = await source.query(fileSummarySql);
    const before = await source.query(
      'SELECT (SELECT COUNT(*) FROM "Business")::int businesses,(SELECT COUNT(*) FROM "Member")::int members,(SELECT COUNT(*) FROM "Payment")::int payments,(SELECT COALESCE(SUM("amountPaise"),0) FROM "Payment")::bigint collected',
    );
    const dump = resolve(work, "clubhouse.dump");
    await run(
      resolve(pgBin, "pg_dump" + extension),
      ["--format=custom", "--no-owner", "--no-acl", `--file=${dump}`],
      env,
    );
    await run(restic, ["init"], env);
    await run(
      restic,
      [
        "backup",
        "--stdin",
        "--stdin-filename",
        "clubhouse.dump",
        "--tag",
        "clubhouse",
        "--host",
        "clubhouse",
      ],
      env,
      readFileSync(dump),
    );
    await run(restic, ["check", "--read-data"], env);
    let wrongPasswordRejected = false;
    try {
      await run(restic, ["snapshots"], {
        ...env,
        RESTIC_PASSWORD: "incorrect-password",
      });
    } catch {
      wrongPasswordRejected = true;
    }
    assert(wrongPasswordRejected, "Wrong password must not decrypt repository");
    await run(
      restic,
      [
        "restore",
        "latest",
        "--tag",
        "clubhouse",
        "--host",
        "clubhouse",
        "--target",
        resolve(work, "restored"),
      ],
      env,
    );
    await source.query(
      `CREATE DATABASE "${target}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    created = true;
    await run(
      resolve(pgBin, "pg_restore" + extension),
      [
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
        `--dbname=${target}`,
        resolve(work, "restored/clubhouse.dump"),
      ],
      env,
    );
    const restoredUrl = new URL(url);
    restoredUrl.pathname = `/${target}`;
    const restored = new Client({ connectionString: restoredUrl.toString() });
    await restored.connect();
    try {
      const after = await restored.query(
        'SELECT (SELECT COUNT(*) FROM "Business")::int businesses,(SELECT COUNT(*) FROM "Member")::int members,(SELECT COUNT(*) FROM "Payment")::int payments,(SELECT COALESCE(SUM("amountPaise"),0) FROM "Payment")::bigint collected',
      );
      assert.deepEqual(after.rows[0], before.rows[0]);
      const filesAfter = await restored.query(fileSummarySql);
      assert.deepEqual(filesAfter.rows[0], filesBefore.rows[0]);
      mkdirSync("artifacts", { recursive: true });
      writeFileSync(
        "artifacts/backup-test.json",
        JSON.stringify(
          {
            status: "passed",
            repository: "local encrypted restic repository",
            wrongPasswordRejected,
            restored: after.rows[0],
            restoredFiles: filesAfter.rows[0].files,
            fileContentAndLinksMatch: true,
          },
          null,
          2,
        ),
      );
      console.info(
        "Encrypted restic backup verified and restored into a new database. Business/member/payment counts, ledger totals, shared-file bytes and links match. Wrong password rejected.",
      );
    } finally {
      await restored.end();
    }
  } finally {
    if (created) await source.query(`DROP DATABASE "${target}" WITH (FORCE)`);
    await source.end();
    if (fileFixture) await cleanup(fileFixture.b.id);
    await db.$disconnect();
    // Both paths are resolved above and the randomly named directory is confined to .local.
    if (work.startsWith(localRoot + sep) && work.includes("backup-drill-"))
      rmSync(work, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
