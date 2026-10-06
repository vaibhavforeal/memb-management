import { getContext, ownerOnly, assertActive } from "@/lib/context";
import { db } from "@/lib/db";
import { dateLabel, membershipStatus } from "@/lib/domain";
import { PlanRequiredError } from "@/lib/workspace-access";
import {
  exportMemberDirectory,
  parseDirectoryFilters,
} from "@/lib/member-directory";
export const dynamic = "force-dynamic";
function csv(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await getContext({ api: true });
    await assertActive(ctx);
  } catch (error) {
    if (error instanceof PlanRequiredError)
      return Response.json(
        { message: error.message, upgradeUrl: error.upgradeUrl },
        { status: 402, headers: { "Cache-Control": "no-store" } },
      );
    throw error;
  }
  try {
    ownerOnly(ctx);
  } catch {
    return new Response("Owner access required", { status: 403 });
  }
  const search = new URL(request.url).searchParams;
  const filtered = search.get("scope") === "filtered";
  const filters = parseDirectoryFilters(Object.fromEntries(search));
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          filtered
            ? "\uFEFFmember_id,name,phone,email,status,joined,plan,expiry,outstanding_inr\r\n"
            : "\uFEFFmember_id,name,phone,email,status,joined\r\n",
        ),
      );
      try {
        if (filtered) {
          for await (const members of exportMemberDirectory(ctx, filters)) {
            for (const m of members)
              controller.enqueue(
                encoder.encode(
                  [
                    m.code,
                    m.name,
                    m.phone,
                    m.email ?? "",
                    m.status,
                    dateLabel(m.createdAt),
                    m.planName ?? "",
                    m.endDate ? dateLabel(m.endDate) : "",
                    (Number(m.outstanding) / 100).toFixed(2),
                  ]
                    .map(csv)
                    .join(",") + "\r\n",
                ),
              );
          }
        } else {
          let cursor: string | undefined;
          while (true) {
            const members = await db.member.findMany({
              where: { businessId: ctx.businessId },
              include: { contact: true, memberships: true },
              orderBy: { id: "asc" },
              take: 500,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            });
            if (!members.length) break;
            for (const m of members)
              controller.enqueue(
                encoder.encode(
                  [
                    m.code,
                    m.name,
                    m.contact.phone,
                    m.email ?? "",
                    m.archived ? "Archived" : membershipStatus(m.memberships),
                    dateLabel(m.createdAt),
                  ]
                    .map(csv)
                    .join(",") + "\r\n",
                ),
              );
            cursor = members[members.length - 1].id;
          }
        }
        await db.auditLog.create({
          data: {
            businessId: ctx.businessId,
            actorId: ctx.userId,
            action: "MEMBERS_EXPORTED",
            detail: filtered ? "Filtered directory CSV export" : "CSV export",
          },
        });
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="membrr-members.csv"',
      "Cache-Control": "no-store",
    },
  });
}
