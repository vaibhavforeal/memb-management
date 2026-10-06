import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { addDays, todayIST } from "../src/lib/domain";
import { checkIn, saveMember } from "../src/lib/services";
import {
  checkInMemberQr,
  issueMemberQr,
  lookupMemberQr,
  readMemberQr,
} from "../src/lib/member-qr";
import { memberQrPayload, parseMemberQr } from "../src/lib/member-qr-format";
import { decrypt } from "../src/lib/security";
import { cleanup, ensureLocalTest, fixture } from "./test-support";

async function main() {
  ensureLocalTest();
  const first = await fixture("itest"),
    second = await fixture("itest");
  const { ctx } = first;
  const today = todayIST();
  try {
    const plan = await db.plan.create({
      data: {
        businessId: ctx.businessId,
        name: "QR test",
        months: 1,
        amountPaise: 200000,
      },
    });
    const m = await saveMember(ctx, {
      name: "QR Test Member",
      phone: "9781234567",
    });
    const term = await db.membership.create({
      data: {
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        memberId: m.id,
        planId: plan.id,
        planName: plan.name,
        startDate: today,
        endDate: addDays(today, 7),
      },
    });
    const cards = await Promise.all([
      issueMemberQr(ctx, m.id),
      issueMemberQr(ctx, m.id),
    ]);
    assert.equal(cards[0].image, cards[1].image);
    assert(cards[0].image.startsWith("data:image/png;base64,"));
    assert.equal(
      await db.auditLog.count({
        where: { entityId: m.id, action: "MEMBER_QR_ISSUED" },
      }),
      1,
    );
    const qr = await db.memberQr.findUniqueOrThrow({
      where: { memberId: m.id },
    });
    const raw = memberQrPayload(decrypt(qr.encryptedToken));
    assert(!raw.includes(m.name));
    assert(!raw.includes(m.code));
    assert(parseMemberQr(raw));
    assert.equal(parseMemberQr("https://example.test/"), null);
    assert.equal(parseMemberQr(raw + "extra"), null);
    assert.equal((await lookupMemberQr(ctx, raw)).canCheckIn, true);
    assert.equal(await db.checkin.count({ where: { memberId: m.id } }), 0);
    console.info(
      "PASS QR generation, concurrent issuance, encryption and scan preview without check-in",
    );

    await assert.rejects(
      () => lookupMemberQr(second.ctx, raw),
      /not recognized/,
    );
    await assert.rejects(
      () => checkInMemberQr(second.ctx, raw),
      /not recognized/,
    );
    await assert.rejects(() => issueMemberQr(second.ctx, m.id), /not found/);
    assert.equal(await readMemberQr(second.ctx, m.id), null);
    await assert.rejects(
      () => lookupMemberQr(ctx, "bad qr"),
      /not a membrr/,
    );
    const results = await Promise.all([
      checkInMemberQr(ctx, raw),
      checkInMemberQr(ctx, raw),
    ]);
    assert.equal(results.filter((r) => !r.alreadyCheckedIn).length, 1);
    const checkins = await db.checkin.findMany({ where: { memberId: m.id } });
    assert.equal(checkins.length, 1);
    assert.equal(checkins[0].source, "QR");
    assert.equal(checkins[0].recordedBy, ctx.userId);
    await checkIn(ctx, m.id);
    assert.equal(await db.checkin.count({ where: { memberId: m.id } }), 1);
    assert.equal((await lookupMemberQr(ctx, raw)).checkedIn, true);
    console.info(
      "PASS business isolation, simultaneous scans and manual/QR duplicate prevention",
    );

    await db.checkin.deleteMany({ where: { memberId: m.id } });
    await checkIn(ctx, m.id);
    assert.equal((await checkInMemberQr(ctx, raw)).alreadyCheckedIn, true);
    assert.equal(
      (await db.checkin.findFirstOrThrow({ where: { memberId: m.id } })).source,
      "STAFF",
    );
    await db.checkin.deleteMany({ where: { memberId: m.id } });
    for (const dates of [
      {
        startDate: addDays(today, -7),
        endDate: addDays(today, -1),
        cancelledAt: null,
      },
      {
        startDate: addDays(today, 1),
        endDate: addDays(today, 7),
        cancelledAt: null,
      },
      { startDate: today, endDate: addDays(today, 7), cancelledAt: new Date() },
    ]) {
      await db.membership.update({ where: { id: term.id }, data: dates });
      assert.equal((await lookupMemberQr(ctx, raw)).canCheckIn, false);
      await assert.rejects(
        () => checkInMemberQr(ctx, raw),
        /active membership/,
      );
    }
    await db.membership.update({
      where: { id: term.id },
      data: { startDate: today, endDate: today, cancelledAt: null },
    });
    assert.equal((await lookupMemberQr(ctx, raw)).canCheckIn, true);
    await db.member.update({ where: { id: m.id }, data: { archived: true } });
    await assert.rejects(() => checkInMemberQr(ctx, raw), /active membership/);
    await assert.rejects(() => issueMemberQr(ctx, m.id), /Restore/);
    await db.member.update({ where: { id: m.id }, data: { archived: false } });
    console.info(
      "PASS expired, upcoming, cancelled and archived members; inclusive expiry day",
    );

    const staffUser = await db.user.create({
      data: {
        id: randomUUID(),
        name: "QR staff",
        email: `qr-${randomUUID()}@example.test`,
      },
    });
    await db.staffAccess.create({
      data: { businessId: ctx.businessId, userId: staffUser.id, role: "STAFF" },
    });
    const staff = { ...ctx, role: "STAFF" as const, userId: staffUser.id };
    assert.equal((await issueMemberQr(staff, m.id)).image, cards[0].image);
    await assert.rejects(() => issueMemberQr(staff, m.id, true), /owner/);
    await issueMemberQr(ctx, m.id, true);
    await assert.rejects(() => lookupMemberQr(ctx, raw), /not recognized/);
    await assert.rejects(() => checkInMemberQr(ctx, raw), /not recognized/);
    const replacement = memberQrPayload(
      decrypt(
        (await db.memberQr.findUniqueOrThrow({ where: { memberId: m.id } }))
          .encryptedToken,
      ),
    );
    assert.notEqual(raw, replacement);
    await checkInMemberQr(staff, replacement);
    assert.equal(
      (await db.checkin.findFirstOrThrow({ where: { memberId: m.id } }))
        .recordedBy,
      staff.userId,
    );
    await db.staffAccess.update({
      where: {
        businessId_userId: { businessId: ctx.businessId, userId: staff.userId },
      },
      data: { role: "OWNER" },
    });
    await assert.rejects(
      () => checkInMemberQr(staff, replacement),
      /access has changed/,
    );
    await db.business.update({
      where: { id: ctx.businessId },
      data: { status: "SUSPENDED" },
    });
    await assert.rejects(() => checkInMemberQr(ctx, replacement), /not active/);
    await assert.rejects(() => readMemberQr(ctx, m.id), /not active/);
    console.info(
      "PASS staff scanning, owner-only replacement, invalidated cards, changed access and suspension",
    );
  } finally {
    await cleanup(first.b.id);
    await cleanup(second.b.id);
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
