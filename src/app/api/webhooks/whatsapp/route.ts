import { NextRequest, NextResponse } from "next/server";
import { verifyMetaSignature } from "@/lib/security";
import { processWebhook } from "@/lib/messaging";
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (
    process.env.META_WEBHOOK_VERIFY_TOKEN &&
    q.get("hub.mode") === "subscribe" &&
    q.get("hub.verify_token") === process.env.META_WEBHOOK_VERIFY_TOKEN
  )
    return new Response(q.get("hub.challenge"));
  return new Response("Forbidden", { status: 403 });
}
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 1000000) return new Response("Too large", { status: 413 });
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256")))
    return new Response("Invalid signature", { status: 401 });
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!payload || !Array.isArray(payload.entry))
    return new Response("Invalid event", { status: 400 });
  try {
    await processWebhook(payload);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(
      "Webhook processing failed",
      error instanceof Error ? error.message : "unknown",
    );
    return new Response("Retry delivery", { status: 500 });
  }
}
