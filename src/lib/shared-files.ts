import { fileTypeFromBuffer } from "file-type";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { assertActive, type TenantContext } from "./context";
import { hasWorkspaceAccess } from "./workspace-access";
import { decrypt, encrypt, hashToken, secretToken } from "./security";
import {
  FILE_TYPES_LABEL,
  MAX_FILE_BYTES,
  type SharedFileItem,
} from "./shared-file-utils";

const MAX_BUSINESS_BYTES = 100 * 1024 * 1024;
const MAX_ACTIVE_FILES = 50;
const LINK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export class SharedFileError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function shareLinkConfig() {
  const url = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
  const host = url.hostname.toLowerCase();
  const localOnly =
    !host.includes(".") ||
    /(^|\.)(localhost|local|test|internal)$/.test(host) ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      host,
    ) ||
    host.includes(":");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(localOnly && url.protocol === "http:"))
  )
    throw new SharedFileError(
      "Set BETTER_AUTH_URL to the public HTTPS address of this app.",
      503,
    );
  return { origin: url.origin, localOnly };
}

export async function validateSharedFile(name: string, bytes: Uint8Array) {
  if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES)
    throw new SharedFileError(
      "Choose a non-empty file no larger than 10 MB.",
      413,
    );
  if (
    !name ||
    name.length > 160 ||
    /[\\/\x00-\x1f\x7f<>\u202a-\u202e\u2066-\u2069]/u.test(name)
  )
    throw new SharedFileError(
      "Use a filename of 160 characters or fewer, without slashes or control characters.",
    );
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const expected = mimeByExtension[extension];
  if (!expected) throw new SharedFileError(FILE_TYPES_LABEL);
  const detected = await fileTypeFromBuffer(bytes).catch(() => undefined);
  if (detected?.mime !== expected)
    throw new SharedFileError(
      "The file contents do not match its extension. Choose a valid image, PDF or Word (.docx) file.",
    );
  return { name: name.trim(), mimeType: expected };
}

const metadata = {
  id: true,
  name: true,
  size: true,
  encryptedToken: true,
  expiresAt: true,
} satisfies Prisma.SharedFileSelect;
type FileMetadata = Prisma.SharedFileGetPayload<{ select: typeof metadata }>;

function forClient(file: FileMetadata): SharedFileItem {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    expiresAt: file.expiresAt.toISOString(),
    url: `${shareLinkConfig().origin}/files/${decrypt(file.encryptedToken)}`,
  };
}

function manageable(ctx: TenantContext): Prisma.SharedFileWhereInput {
  return {
    businessId: ctx.businessId,
    branchId: ctx.branchId,
    ...(ctx.role === "OWNER" ? {} : { uploadedBy: ctx.userId }),
  };
}

export async function listSharedFiles(ctx: TenantContext) {
  await assertActive(ctx);
  const files = await db.sharedFile.findMany({
    where: {
      ...manageable(ctx),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: metadata,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: MAX_ACTIVE_FILES,
  });
  return files.map(forClient);
}

export async function uploadSharedFile(
  ctx: TenantContext,
  name: string,
  bytes: Uint8Array,
) {
  await assertActive(ctx);
  shareLinkConfig();
  const validated = await validateSharedFile(name, bytes);
  const token = secretToken();
  const encryptedToken = encrypt(token);
  const now = new Date();
  const file = await db.$transaction(
    async (tx) => {
      // Serialize quota checks and inserts for a business, including simultaneous uploads.
      const businesses = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`
      SELECT status FROM "Business" WHERE id=${ctx.businessId} FOR UPDATE`);
      if (businesses[0]?.status !== "ACTIVE")
        throw new SharedFileError("This business is not active.", 403);
      // Reclaim expired payloads without removing the upload/audit history.
      await tx.sharedFile.updateMany({
        where: {
          businessId: ctx.businessId,
          expiresAt: { lte: now },
          content: { not: null },
        },
        data: { content: null },
      });
      const active = {
        businessId: ctx.businessId,
        revokedAt: null,
        expiresAt: { gt: now },
      };
      const usage = await tx.sharedFile.aggregate({
        where: active,
        _sum: { size: true },
        _count: true,
      });
      if (
        usage._count >= MAX_ACTIVE_FILES ||
        (usage._sum.size ?? 0) + bytes.byteLength > MAX_BUSINESS_BYTES
      )
        throw new SharedFileError(
          "Your business has reached its file limit (50 files / 100 MB). Revoke an unused link first.",
          409,
        );
      const recent = await tx.sharedFile.count({
        where: {
          businessId: ctx.businessId,
          createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) },
        },
      });
      if (recent >= 20)
        throw new SharedFileError(
          "Your business can upload 20 files per hour. Reuse an existing link or try later.",
          429,
        );
      const created = await tx.sharedFile.create({
        data: {
          businessId: ctx.businessId,
          branchId: ctx.branchId,
          uploadedBy: ctx.userId,
          ...validated,
          size: bytes.byteLength,
          content: new Uint8Array(bytes),
          tokenHash: hashToken(token),
          encryptedToken,
          expiresAt: new Date(now.getTime() + LINK_LIFETIME_MS),
        },
        select: metadata,
      });
      await tx.auditLog.create({
        data: {
          businessId: ctx.businessId,
          actorId: ctx.userId,
          action: "FILE_UPLOADED",
          entityId: created.id,
          detail: validated.name,
        },
      });
      return created;
    },
    { timeout: 15000 },
  );
  return forClient(file);
}

export async function revokeSharedFile(ctx: TenantContext, id: string) {
  await assertActive(ctx);
  await db.$transaction(async (tx) => {
    const file = await tx.sharedFile.findFirst({
      where: { ...manageable(ctx), id },
      select: { id: true, revokedAt: true },
    });
    if (!file) throw new SharedFileError("File not found.", 404);
    if (file.revokedAt) return;
    await tx.sharedFile.update({
      where: { id: file.id },
      data: { revokedAt: new Date(), content: null },
    });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        actorId: ctx.userId,
        action: "FILE_LINK_REVOKED",
        entityId: file.id,
        detail: "Link disabled; file content removed.",
      },
    });
  });
}

export async function findSharedDownload(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const file = await db.sharedFile.findFirst({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
      business: { status: "ACTIVE" },
      content: { not: null },
    },
    select: {
      name: true,
      mimeType: true,
      size: true,
      content: true,
      business: {
        select: {
          trialRequired: true,
          trialEndsAt: true,
          billingPaidThrough: true,
        },
      },
    },
  });
  if (!file || !hasWorkspaceAccess(file.business)) return null;
  const { business: _business, ...download } = file;
  return download;
}
