import "dotenv/config";
import assert from "node:assert/strict";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { fixture, cleanup, ensureLocalTest } from "./test-support";
import { saveBusinessLogo, removeBusinessLogo } from "../src/lib/business-logo";

async function main() {
  ensureLocalTest();
  const a = await fixture("itest"),
    b = await fixture("itest");
  const content = await sharp({
    create: { width: 32, height: 32, channels: 4, background: "#10aa88" },
  })
    .png()
    .toBuffer();
  try {
    const firstVersion = await saveBusinessLogo(a.ctx, content);
    const saved = await db.businessLogo.findUniqueOrThrow({
      where: { businessId: a.b.id },
    });
    assert.equal(saved.version, firstVersion);
    assert.equal((await sharp(saved.content).metadata()).format, "webp");
    assert.equal(
      await db.businessLogo.findUnique({ where: { businessId: b.b.id } }),
      null,
    );
    await assert.rejects(
      saveBusinessLogo({ ...a.ctx, role: "STAFF" }, content),
      /Only an owner/,
    );
    await assert.rejects(
      removeBusinessLogo({ ...a.ctx, role: "STAFF" }),
      /Only an owner/,
    );
    await assert.rejects(
      saveBusinessLogo(
        { ...b.ctx, businessId: a.b.id, branchId: a.ctx.branchId },
        content,
      ),
      /access has changed/,
    );
    await assert.rejects(
      removeBusinessLogo({
        ...b.ctx,
        businessId: a.b.id,
        branchId: a.ctx.branchId,
      }),
      /access has changed/,
    );
    await assert.rejects(
      saveBusinessLogo(a.ctx, Buffer.from("invalid")),
      /PNG/,
    );
    assert.equal(
      (
        await db.businessLogo.findUniqueOrThrow({
          where: { businessId: a.b.id },
        })
      ).version,
      firstVersion,
    );
    const secondVersion = await saveBusinessLogo(a.ctx, content);
    assert.notEqual(firstVersion, secondVersion);
    assert.equal(
      await db.businessLogo.count({ where: { businessId: a.b.id } }),
      1,
    );
    await db.business.update({
      where: { id: a.b.id },
      data: { status: "SUSPENDED" },
    });
    await assert.rejects(saveBusinessLogo(a.ctx, content), /not active/);
    await assert.rejects(removeBusinessLogo(a.ctx), /not active/);
    await db.business.update({
      where: { id: a.b.id },
      data: { status: "ACTIVE" },
    });
    await removeBusinessLogo(a.ctx);
    assert.equal(
      await db.businessLogo.findUnique({ where: { businessId: a.b.id } }),
      null,
    );
    assert.equal(
      await db.auditLog.count({
        where: {
          businessId: a.b.id,
          action: { in: ["BUSINESS_LOGO_SAVED", "BUSINESS_LOGO_REMOVED"] },
        },
      }),
      3,
    );
    console.log(
      "Business logo persistence, replacement, removal, validation, isolation and permissions passed.",
    );
  } finally {
    await cleanup(a.b.id);
    await cleanup(b.b.id);
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
