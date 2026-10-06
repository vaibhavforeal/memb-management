import { setTimeout as delay } from "node:timers/promises";
import { db } from "./db";
import { deliverMessage } from "./messaging";
import { providerSend } from "./whatsapp";

// One exclusive pg-boss job per business drains a bounded batch. Waiting for
// the sender's next slot keeps throttled work moving within the same minute.
// The database claim in deliverMessage remains the authority for every send.
export async function drainBusinessMessages(
  businessId: string,
  options: {
    send?: typeof providerSend;
    maxDurationMs?: number;
    maxMessages?: number;
  } = {},
) {
  const deadline = Date.now() + (options.maxDurationMs ?? 45000);
  const limit = options.maxMessages ?? 500;
  let processed = 0;
  while (Date.now() < deadline && processed < limit) {
    const message = await db.message.findFirst({
      where: { businessId, status: "QUEUED", scheduledAt: { lte: new Date() } },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (!message) break;
    const connection = await db.whatsAppConnection.findUnique({
      where: { businessId },
      select: { nextSendAt: true },
    });
    const waitMs = Math.max(
      0,
      (connection?.nextSendAt.getTime() ?? 0) - Date.now(),
    );
    if (waitMs >= deadline - Date.now()) break;
    if (waitMs > 0) await delay(waitMs);
    await deliverMessage(message.id, options.send ?? providerSend);
    processed++;
  }
  return processed;
}
