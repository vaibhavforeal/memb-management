import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { db } from "./db";
import { assertActive, ownerOnly, type TenantContext } from "./context";
import { decrypt, encrypt, hashToken, secretToken } from "./security";
import { todayIST } from "./domain";
import {
  memberQrPayload,
  parseMemberQr,
  type ScannedMember,
} from "./member-qr-format";

export class MemberQrError extends Error {}

function tokenFrom(raw: string) {
  const token = parseMemberQr(raw);
  if (!token)
    throw new MemberQrError(
      "This is not a membrr member QR. Use the QR from a member card.",
    );
  return token;
}

export async function readMemberQr(ctx: TenantContext, memberId: string) {
  await assertActive(ctx);
  const member = await db.member.findFirst({
    where: { id: memberId, businessId: ctx.businessId },
    select: {
      name: true,
      code: true,
      qr: true,
      business: { select: { name: true } },
    },
  });
  if (!member?.qr) return null;
  return {
    name: member.name,
    code: member.code,
    business: member.business.name,
    image: await QRCode.toDataURL(
      memberQrPayload(decrypt(member.qr.encryptedToken)),
      {
        width: 640,
        margin: 4,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      },
    ),
  };
}

export async function issueMemberQr(
  ctx: TenantContext,
  memberId: string,
  replace = false,
) {
  await assertActive(ctx);
  if (replace) ownerOnly(ctx);
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; archived: boolean }[]>`
      SELECT id, archived FROM "Member" WHERE id = ${memberId} AND "businessId" = ${ctx.businessId} FOR UPDATE`;
    if (!rows[0]) throw new MemberQrError("Member not found in this business.");
    if (rows[0].archived)
      throw new MemberQrError("Restore this member before issuing a QR card.");
    const existing = await tx.memberQr.findUnique({ where: { memberId } });
    if (existing && !replace) return;
    const token = secretToken();
    const data = {
      tokenHash: hashToken(token),
      encryptedToken: encrypt(token),
    };
    await tx.memberQr.upsert({
      where: { memberId },
      create: { memberId, businessId: ctx.businessId, ...data },
      update: data,
    });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        entityId: memberId,
        action: `${ctx.support ? "SUPPORT:" : ""}${existing ? "MEMBER_QR_REPLACED" : "MEMBER_QR_ISSUED"}`,
        detail: existing
          ? "Previous QR card invalidated"
          : "Member attendance QR card issued",
      },
    });
  });
  return (await readMemberQr(ctx, memberId))!;
}

export async function lookupMemberQr(
  ctx: TenantContext,
  raw: string,
): Promise<ScannedMember> {
  await assertActive(ctx);
  const token = tokenFrom(raw);
  const today = todayIST();
  const qr = await db.memberQr.findFirst({
    where: { businessId: ctx.businessId, tokenHash: hashToken(token) },
    include: {
      member: {
        include: {
          memberships: {
            where: {
              cancelledAt: null,
              startDate: { lte: today },
              endDate: { gte: today },
            },
            take: 1,
          },
          checkins: { where: { day: today }, take: 1 },
        },
      },
    },
  });
  if (!qr)
    throw new MemberQrError(
      "QR not recognized in this business. It may have been replaced.",
    );
  const m = qr.member;
  const active = !m.archived && m.memberships.length > 0;
  return {
    name: m.name,
    code: m.code,
    status: m.archived
      ? "Archived"
      : active
        ? "Active"
        : "No active membership",
    canCheckIn: active && m.checkins.length === 0,
    checkedIn: m.checkins.length > 0,
  };
}

export async function checkInMemberQr(ctx: TenantContext, raw: string) {
  await assertActive(ctx);
  const token = tokenFrom(raw);
  const today = todayIST();
  return db.$transaction(async (tx) => {
    // Serialize with card replacement; recheck the card and membership at confirmation.
    const rows = await tx.$queryRaw<{ memberId: string }[]>`
      SELECT "memberId" FROM "MemberQr" WHERE "businessId" = ${ctx.businessId}
        AND "tokenHash" = ${hashToken(token)} FOR UPDATE`;
    if (!rows[0])
      throw new MemberQrError(
        "QR not recognized in this business. It may have been replaced.",
      );
    const m = await tx.member.findFirst({
      where: {
        id: rows[0].memberId,
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        archived: false,
        memberships: {
          some: {
            cancelledAt: null,
            startDate: { lte: today },
            endDate: { gte: today },
          },
        },
      },
      select: { id: true, name: true, code: true },
    });
    if (!m)
      throw new MemberQrError(
        "An active membership is required to check in. Review this member at the front desk.",
      );
    const result = await tx.checkin.createMany({
      data: [
        {
          id: randomUUID(),
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          memberId: m.id,
          day: today,
          recordedBy: ctx.userId,
          source: "QR",
        },
      ],
      skipDuplicates: true,
    });
    return { name: m.name, alreadyCheckedIn: result.count === 0 };
  });
}
