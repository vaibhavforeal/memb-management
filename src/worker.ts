import "dotenv/config";
import { PgBoss } from "pg-boss";
import { db } from "./lib/db";
import { recoverInterruptedMessages, scheduleReminders } from "./lib/messaging";
import { sendEmail } from "./lib/mail";
import { drainBusinessMessages } from "./lib/delivery-batch";
import { manualWhatsApp } from "./lib/whatsapp-mode";

const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL!,
  application_name: "membrr-worker",
});
boss.on("error", (error) => console.error("Queue error:", error.message));
async function main() {
  if (manualWhatsApp()) {
    console.info(
      "Manual WhatsApp enabled. No messaging worker is required; messages are sent by the user in WhatsApp.",
    );
    return;
  }
  await boss.start();
  await boss.createQueue("tick");
  await boss.createQueue("deliver-business", { policy: "exclusive" });
  await boss.schedule("tick", "* * * * *");
  await boss.work("tick", async () => {
    await recoverInterruptedMessages();
    await scheduleReminders();
    const due = await db.message.groupBy({
      by: ["businessId"],
      where: { status: "QUEUED", scheduledAt: { lte: new Date() } },
    });
    for (const business of due)
      await boss.send(
        "deliver-business",
        { businessId: business.businessId },
        {
          singletonKey: business.businessId,
          expireInSeconds: 90,
          retryLimit: 0,
        },
      );
    await db.workerHeartbeat.upsert({
      where: { id: "worker" },
      create: {
        id: "worker",
        detail: `${due.length} businesses with due messages`,
      },
      update: {
        updatedAt: new Date(),
        detail: `${due.length} businesses with due messages`,
      },
    });
    const backlog = await db.message.count({
      where: {
        status: "QUEUED",
        scheduledAt: { lt: new Date(Date.now() - 30 * 60000) },
      },
    });
    const health = await db.workerHeartbeat.findUnique({
      where: { id: "backlog-alert" },
    });
    if (
      backlog > 100 &&
      process.env.ALERT_EMAIL &&
      (!health || health.updatedAt < new Date(Date.now() - 3600000))
    ) {
      await sendEmail(
        process.env.ALERT_EMAIL,
        "membrr: message queue needs attention",
        `${backlog} messages are more than 30 minutes overdue.`,
      );
      await db.workerHeartbeat.upsert({
        where: { id: "backlog-alert" },
        create: { id: "backlog-alert" },
        update: { updatedAt: new Date() },
      });
    }
  });
  await boss.work<{ businessId: string }>(
    "deliver-business",
    { batchSize: 1, localConcurrency: 10 },
    async (jobs) => {
      for (const job of jobs) await drainBusinessMessages(job.data.businessId);
    },
  );
  await boss.send("tick");
  console.info(
    `membrr worker running; WhatsApp ${process.env.WHATSAPP_DRY_RUN === "true" ? "DRY RUN" : "live mode"}`,
  );
}
async function shutdown() {
  await boss.stop();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
