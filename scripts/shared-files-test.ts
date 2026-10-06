import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { fixture, cleanup, ensureLocalTest } from "./test-support";
import {
  uploadSharedFile,
  listSharedFiles,
  revokeSharedFile,
  findSharedDownload,
} from "../src/lib/shared-files";
import { samplePdf, samplePng } from "./shared-file-fixtures";
import { secretToken, hashToken, encrypt } from "../src/lib/security";

const tokenFrom = (url: string) => new URL(url).pathname.split("/").pop()!;

async function main() {
  ensureLocalTest();
  const a = await fixture("itest"),
    b = await fixture("itest"),
    quota = await fixture("itest");
  try {
    const first = await uploadSharedFile(a.ctx, "नियम.pdf", samplePdf);
    assert.deepEqual(
      Buffer.from((await findSharedDownload(tokenFrom(first.url)))!.content!),
      samplePdf,
    );
    assert.equal((await listSharedFiles(b.ctx)).length, 0);
    await assert.rejects(() => revokeSharedFile(b.ctx, first.id), /not found/);
    assert.equal(await findSharedDownload(first.id), null);
    assert.equal(await findSharedDownload(secretToken()), null);

    const staff = await db.user.create({
      data: {
        id: randomUUID(),
        name: "File test staff",
        email: `${randomUUID()}@example.test`,
      },
    });
    await db.staffAccess.create({
      data: { businessId: a.b.id, userId: staff.id, role: "STAFF" },
    });
    const staffCtx = { ...a.ctx, userId: staff.id, role: "STAFF" as const };
    const second = await uploadSharedFile(staffCtx, "schedule.png", samplePng);
    assert.deepEqual(
      (await listSharedFiles(staffCtx)).map((f) => f.id),
      [second.id],
    );
    await assert.rejects(
      () => revokeSharedFile(staffCtx, first.id),
      /not found/,
    );
    assert.equal((await listSharedFiles(a.ctx)).length, 2);
    await revokeSharedFile(a.ctx, second.id);
    assert.equal(await findSharedDownload(tokenFrom(second.url)), null);
    assert.equal(
      (await db.sharedFile.findUniqueOrThrow({ where: { id: second.id } }))
        .content,
      null,
    );
    await revokeSharedFile(a.ctx, second.id);
    assert.equal(
      await db.auditLog.count({
        where: { entityId: second.id, action: "FILE_LINK_REVOKED" },
      }),
      1,
    );

    await db.business.update({
      where: { id: a.b.id },
      data: { status: "SUSPENDED" },
    });
    assert.equal(await findSharedDownload(tokenFrom(first.url)), null);
    await assert.rejects(
      () => uploadSharedFile(a.ctx, "rules.pdf", samplePdf),
      /not active/,
    );
    await db.business.update({
      where: { id: a.b.id },
      data: { status: "ACTIVE" },
    });
    await db.sharedFile.update({
      where: { id: first.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal(await findSharedDownload(tokenFrom(first.url)), null);
    await uploadSharedFile(a.ctx, "new-rules.pdf", samplePdf);
    assert.equal(
      (await db.sharedFile.findUniqueOrThrow({ where: { id: first.id } }))
        .content,
      null,
    );
    await db.staffAccess.update({
      where: { businessId_userId: { businessId: a.b.id, userId: staff.id } },
      data: { role: "OWNER" },
    });
    await assert.rejects(() => listSharedFiles(staffCtx), /access has changed/);

    // Start one slot below the cap and exercise simultaneous uploads against real row locks.
    const rows = Array.from({ length: 49 }, () => {
      const token = secretToken();
      return {
        businessId: quota.b.id,
        branchId: quota.ctx.branchId,
        uploadedBy: quota.user.id,
        name: "seed.pdf",
        mimeType: "application/pdf",
        size: samplePdf.length,
        content: new Uint8Array(samplePdf),
        tokenHash: hashToken(token),
        encryptedToken: encrypt(token),
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(Date.now() - 7200000),
      };
    });
    await db.sharedFile.createMany({ data: rows });
    const attempts = await Promise.allSettled([
      uploadSharedFile(quota.ctx, "one.pdf", samplePdf),
      uploadSharedFile(quota.ctx, "two.pdf", samplePdf),
    ]);
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      await db.sharedFile.count({ where: { businessId: quota.b.id } }),
      50,
    );
    const rejected = attempts.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    assert.match(rejected.reason.message, /file limit/);
    console.info(
      "Shared-file integration passed: exact content, tenant and staff isolation, revocation, expiry, suspension, stale access, audit, expired payload cleanup, and concurrent quota protection.",
    );
  } finally {
    for (const f of [a, b, quota]) await cleanup(f.b.id);
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
