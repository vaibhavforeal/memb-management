import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { assertActive, type TenantContext } from "./context";
import { db } from "./db";
import { MAX_PHOTO_BYTES } from "./member-photo-utils";

export class MemberPhotoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function prepareMemberPhoto(content: Buffer) {
  if (!content.length) throw new MemberPhotoError("Choose a photo to upload.");
  if (content.length > MAX_PHOTO_BYTES)
    throw new MemberPhotoError("Choose a photo no larger than 2 MB.", 413);
  const type = await fileTypeFromBuffer(content);
  if (!type || !["image/png", "image/jpeg", "image/webp"].includes(type.mime))
    throw new MemberPhotoError("Choose a PNG, JPG, or WebP image.");
  try {
    const image = sharp(content, {
      limitInputPixels: 16_777_216,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 4096 ||
      metadata.height > 4096 ||
      (metadata.pages ?? 1) > 1
    )
      throw new MemberPhotoError(
        "Choose a still image up to 4096 × 4096 pixels.",
      );
    // Normalize orientation, strip metadata and store only a bounded portrait.
    return await image
      .rotate()
      .resize(640, 640, {
        fit: "cover",
        position: "attention",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
  } catch (error) {
    if (error instanceof MemberPhotoError) throw error;
    throw new MemberPhotoError(
      "This photo could not be read. Choose a valid image.",
    );
  }
}

export async function photoMember(ctx: TenantContext, memberId: string) {
  await assertActive(ctx);
  const member = await db.member.findFirst({
    where: { id: memberId, businessId: ctx.businessId },
    select: { id: true },
  });
  if (!member) throw new MemberPhotoError("Member not found.", 404);
}

export async function saveMemberPhoto(
  ctx: TenantContext,
  memberId: string,
  content: Buffer,
) {
  await photoMember(ctx, memberId);
  const normalized = await prepareMemberPhoto(content);
  await photoMember(ctx, memberId);
  const version = randomUUID();
  await db.$transaction([
    db.memberPhoto.upsert({
      where: { memberId, businessId: ctx.businessId },
      create: {
        memberId,
        businessId: ctx.businessId,
        content: normalized,
        version,
      },
      update: { content: normalized, version },
    }),
    db.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "MEMBER_PHOTO_SAVED",
        entityId: memberId,
        detail: "Member photo uploaded or replaced",
      },
    }),
  ]);
  return version;
}

export async function removeMemberPhoto(ctx: TenantContext, memberId: string) {
  await photoMember(ctx, memberId);
  await db.$transaction([
    db.memberPhoto.deleteMany({
      where: { memberId, businessId: ctx.businessId },
    }),
    db.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "MEMBER_PHOTO_REMOVED",
        entityId: memberId,
        detail: "Member photo removed",
      },
    }),
  ]);
}
