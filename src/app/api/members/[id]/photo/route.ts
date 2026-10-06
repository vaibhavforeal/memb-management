import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import {
  MemberPhotoError,
  photoMember,
  removeMemberPhoto,
  saveMemberPhoto,
} from "@/lib/member-photo";
import { MAX_PHOTO_BYTES, memberPhotoUrl } from "@/lib/member-photo-utils";
import { PlanRequiredError } from "@/lib/workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };
type Route = { params: Promise<{ id: string }> };

async function context(request: Request) {
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL!).origin
  )
    throw new MemberPhotoError(
      "Reload this app before changing the photo.",
      403,
    );
  try {
    return await getContext({ api: true });
  } catch (error) {
    if (error instanceof PlanRequiredError) throw error;
    throw new MemberPhotoError("Sign in to access member photos.", 403);
  }
}
function failure(error: unknown) {
  const known =
    error instanceof MemberPhotoError || error instanceof PlanRequiredError;
  return Response.json(
    {
      message: known ? error.message : "Unable to access this member photo.",
      ...(error instanceof PlanRequiredError
        ? { upgradeUrl: error.upgradeUrl }
        : {}),
    },
    { status: known ? error.status : 500, headers: privateHeaders },
  );
}
async function upload(request: Request) {
  const declared = request.headers.get("content-length");
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_PHOTO_BYTES)
  )
    throw new MemberPhotoError("Choose a photo no larger than 2 MB.", 413);
  if (!request.body) throw new MemberPhotoError("Choose a photo to upload.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_PHOTO_BYTES) {
        await reader.cancel();
        throw new MemberPhotoError("Choose a photo no larger than 2 MB.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}
export async function GET(request: Request, { params }: Route) {
  try {
    const ctx = await context(request),
      { id } = await params;
    await photoMember(ctx, id);
    const photo = await db.memberPhoto.findFirst({
      where: { memberId: id, businessId: ctx.businessId },
    });
    if (!photo)
      return new Response(null, { status: 404, headers: privateHeaders });
    return new Response(new Uint8Array(photo.content), {
      headers: {
        ...privateHeaders,
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, { params }: Route) {
  try {
    const ctx = await context(request),
      { id } = await params;
    await photoMember(ctx, id);
    const version = await saveMemberPhoto(ctx, id, await upload(request));
    return Response.json(
      { photoUrl: memberPhotoUrl(id, version), message: "Member photo saved." },
      { headers: privateHeaders },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request, { params }: Route) {
  try {
    const ctx = await context(request),
      { id } = await params;
    await removeMemberPhoto(ctx, id);
    return Response.json(
      { message: "Member photo removed." },
      { headers: privateHeaders },
    );
  } catch (error) {
    return failure(error);
  }
}
