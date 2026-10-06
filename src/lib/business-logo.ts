import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { assertActive, ownerOnly, type TenantContext } from "./context";
import { db } from "./db";
import { MAX_LOGO_BYTES } from "./business-logo-utils";

export class BusinessLogoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function prepareBusinessLogo(content: Buffer) {
  if (!content.length) throw new BusinessLogoError("Choose a logo to upload.");
  if (content.length > MAX_LOGO_BYTES)
    throw new BusinessLogoError("Choose a logo no larger than 2 MB.", 413);
  const type = await fileTypeFromBuffer(content);
  if (!type || !["image/png", "image/jpeg", "image/webp"].includes(type.mime))
    throw new BusinessLogoError("Choose a PNG, JPG, or WebP image.");
  try {
    // Decode and re-encode to reject corrupt images and strip uploaded metadata.
    const image = sharp(content, {
      limitInputPixels: 16_777_216,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 4096 ||
      metadata.height > 4096
    )
      throw new BusinessLogoError("Choose an image up to 4096 × 4096 pixels.");
    if ((metadata.pages ?? 1) > 1)
      throw new BusinessLogoError("Choose a still image for your logo.");
    return await image
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch (error) {
    if (error instanceof BusinessLogoError) throw error;
    throw new BusinessLogoError(
      "This image could not be read. Choose a valid image up to 4096 × 4096 pixels.",
    );
  }
}

export async function saveBusinessLogo(ctx: TenantContext, content: Buffer) {
  ownerOnly(ctx);
  await assertActive(ctx);
  const normalized = await prepareBusinessLogo(content);
  // Check access again after decoding before committing the change.
  await assertActive(ctx);
  const version = randomUUID();
  await db.$transaction([
    db.businessLogo.upsert({
      where: { businessId: ctx.businessId },
      create: { businessId: ctx.businessId, content: normalized, version },
      update: { content: normalized, version },
    }),
    db.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "BUSINESS_LOGO_SAVED",
        entityId: ctx.businessId,
        detail: "Business logo uploaded or replaced",
      },
    }),
  ]);
  return version;
}

export async function removeBusinessLogo(ctx: TenantContext) {
  ownerOnly(ctx);
  await assertActive(ctx);
  await db.$transaction([
    db.businessLogo.deleteMany({ where: { businessId: ctx.businessId } }),
    db.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "BUSINESS_LOGO_REMOVED",
        entityId: ctx.businessId,
        detail: "Business logo removed",
      },
    }),
  ]);
}
