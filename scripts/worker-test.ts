import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { PgBoss } from "pg-boss";
import { db } from "../src/lib/db";
import { drainBusinessMessages } from "../src/lib/delivery-batch";
import { saveMember } from "../src/lib/services";
import { encrypt } from "../src/lib/security";
import { fixture, cleanup, ensureLocalTest } from "./test-support";

async function main() {
  ensureLocalTest();
  process.env.WHATSAPP_MODE = "cloud";
  process.env.WHATSAPP_DRY_RUN = "false";
  const f = await fixture("itest");
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });
  const queue = `test-batch-${randomUUID()}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await db.whatsAppConnection.create({
      data: {
        businessId: f.b.id,
        phoneNumberId: `test-${f.b.id}`,
        accountId: "test",
        encryptedToken: encrypt("test-token"),
        status: "ACTIVE",
      },
    });
    const template = await db.messageTemplate.create({
      data: {
        businessId: f.b.id,
        name: "test_batch",
        category: "UTILITY",
        status: "APPROVED",
        providerId: "test-template",
        body: "Hello",
        purpose: "ANNOUNCEMENT",
        parameterKeys: [],
      },
    });
    for (let i = 0; i < 10; i++) {
      const phone = "+91950000" + String(i).padStart(4, "0");
      const member = await saveMember(f.ctx, {
        name: `Batch member ${i}`,
        phone,
      });
      await db.message.create({
        data: {
          businessId: f.b.id,
          memberId: member.id,
          templateId: template.id,
          kind: "ANNOUNCEMENT",
          phone,
          scheduledAt: new Date(0),
          idempotencyKey: randomUUID(),
        },
      });
    }
    await boss.start();
    await boss.createQueue(queue, { policy: "exclusive" });
    const options = {
      singletonKey: f.b.id,
      expireInSeconds: 90,
      retryLimit: 0,
    };
    assert(await boss.send(queue, { businessId: f.b.id }, options));
    assert.equal(await boss.send(queue, { businessId: f.b.id }, options), null);
    const sends: { id: string; at: number }[] = [];
    const began = performance.now();
    const complete = new Promise<void>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("The 10-message batch exceeded 30 seconds")),
        30000,
      );
      void boss
        .work<{ businessId: string }>(
          queue,
          { pollingIntervalSeconds: 1 },
          async (jobs) => {
            try {
              for (const job of jobs)
                await drainBusinessMessages(job.data.businessId, {
                  send: async (
                    _sender,
                    _token,
                    _phone,
                    _template,
                    _parameters,
                    messageId,
                  ) => {
                    sends.push({ id: messageId, at: performance.now() });
                    return `wamid-${messageId}`;
                  },
                });
              resolve();
            } catch (error) {
              reject(error);
              throw error;
            }
          },
        )
        .catch(reject);
    });
    await complete;
    clearTimeout(timer);
    assert.equal(sends.length, 10);
    assert.equal(new Set(sends.map((s) => s.id)).size, 10);
    for (let i = 1; i < sends.length; i++)
      assert(
        sends[i].at - sends[i - 1].at >= 1000,
        "Sender throttle was bypassed",
      );
    assert.equal(
      await db.message.count({ where: { businessId: f.b.id, status: "SENT" } }),
      10,
    );
    const result = {
      status: "passed",
      messages: 10,
      elapsedMs: Math.round(performance.now() - began),
      duplicateJobRejected: true,
      minimumGapMs: Math.round(
        Math.min(...sends.slice(1).map((s, i) => s.at - sends[i].at)),
      ),
      provider: "injected fake; no network sends",
    };
    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/worker-test.json",
      JSON.stringify(result, null, 2),
    );
    console.info(JSON.stringify(result, null, 2));
  } finally {
    clearTimeout(timer);
    await boss.stop();
    // This uniquely named queue belongs only to this drill.
    const cleanupBoss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
    });
    await cleanupBoss.start();
    await cleanupBoss.deleteQueue(queue);
    await cleanupBoss.stop();
    await cleanup(f.b.id);
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
