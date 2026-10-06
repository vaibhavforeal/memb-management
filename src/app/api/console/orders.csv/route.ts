import { ordersCsv } from "@/lib/console/csv";
import { requireConsoleAdmin } from "@/lib/console/guard";
import { exportOrders } from "@/lib/console/queries";
import { isConsoleHost } from "@/lib/console/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (
    !isConsoleHost(request.headers.get("host") ?? "", process.env.CONSOLE_HOST)
  ) {
    return new Response("Not found", { status: 404 });
  }
  await requireConsoleAdmin();
  const params = new URL(request.url).searchParams;
  const rows = await exportOrders({
    status: params.get("status") ?? undefined,
    month: params.get("month") ?? undefined,
    q: params.get("q") ?? undefined,
  });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  return new Response(ordersCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="membrr-orders-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
