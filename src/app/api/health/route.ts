import { db } from "@/lib/db";
import { manualWhatsApp } from "@/lib/whatsapp-mode";
import {
  missingDatabaseColumns,
  requiredDatabaseTables,
} from "@/lib/database-schema";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
// The schema only changes on deploy, so a passing check is reused for a few
// minutes; probes in between only confirm connectivity. Failures are never
// cached, so the check turns ready as soon as migrations are applied.
const SCHEMA_CHECK_TTL_MS = 5 * 60_000;
let schemaReadyUntil = 0;

async function schemaReady() {
  if (Date.now() < schemaReadyUntil) {
    await db.$queryRaw`SELECT 1`;
    return true;
  }
  const columns = await db.$queryRaw<
    { table_name: string; column_name: string }[]
  >`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ANY(${requiredDatabaseTables})
  `;
  if (missingDatabaseColumns(columns).length) return false;
  schemaReadyUntil = Date.now() + SCHEMA_CHECK_TTL_MS;
  return true;
}

export async function GET() {
  try {
    if (!(await schemaReady())) {
      return Response.json(
        { status: "unhealthy", database: "up", schema: "outdated" },
        { status: 503, headers: noStore },
      );
    }
    if (manualWhatsApp())
      return Response.json(
        {
          status: "healthy",
          database: "up",
          schema: "ready",
          worker: "not_required",
          messaging: "manual",
        },
        { headers: noStore },
      );
    const worker = await db.workerHeartbeat.findUnique({
      where: { id: "worker" },
    });
    const healthy = Boolean(
      worker && worker.updatedAt > new Date(Date.now() - 180000),
    );
    return Response.json(
      {
        status: healthy ? "healthy" : "degraded",
        database: "up",
        schema: "ready",
        worker: healthy ? "up" : "stale",
      },
      { status: healthy ? 200 : 503, headers: noStore },
    );
  } catch (error) {
    // The response stays generic for public probes; the cause goes to the logs.
    console.error("Health check failed", error);
    return Response.json(
      { status: "unhealthy", database: "down" },
      { status: 503, headers: noStore },
    );
  }
}
