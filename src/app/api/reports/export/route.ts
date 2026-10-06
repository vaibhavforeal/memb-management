import { getContext, ownerOnly } from "@/lib/context";
import { db } from "@/lib/db";
import { dayString, todayIST } from "@/lib/domain";
import {
  hasReportDates,
  parseReportFilters,
  ReportFilterError,
} from "@/lib/report-filters";
import { exportReport } from "@/lib/reports";
import { PlanRequiredError } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";
function planRequired(error: PlanRequiredError) {
  return Response.json(
    { message: error.message, upgradeUrl: error.upgradeUrl },
    { status: 402, headers: { "Cache-Control": "no-store" } },
  );
}
export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await getContext({ api: true });
  } catch (error) {
    if (error instanceof PlanRequiredError) return planRequired(error);
    throw error;
  }
  try {
    ownerOnly(ctx);
  } catch {
    return new Response("Owner access required", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }
  let filters;
  try {
    filters = parseReportFilters(
      Object.fromEntries(new URL(request.url).searchParams),
    );
  } catch (error) {
    if (error instanceof ReportFilterError)
      return Response.json(
        { message: error.message },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    throw error;
  }
  // Build the whole snapshot first so a failure returns a normal error rather
  // than a truncated 200, then audit before any data leaves the server. An
  // aborted download is therefore still recorded.
  // exportReport performs the entitlement check itself.
  let csv = "";
  try {
    for await (const chunk of exportReport(ctx, filters)) csv += chunk;
  } catch (error) {
    if (error instanceof PlanRequiredError) return planRequired(error);
    throw error;
  }
  await db.auditLog.create({
    data: {
      businessId: ctx.businessId,
      actorId: ctx.userId,
      action: "REPORT_EXPORTED",
      detail: JSON.stringify({ ...filters, page: undefined }),
    },
  });
  const range = hasReportDates(filters.type)
    ? `${filters.from}-to-${filters.to}`
    : dayString(todayIST());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="membrr-${filters.type}-${range}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
