import { Prisma } from "@prisma/client";
import { db } from "./db";
import { assertActive, ownerOnly, type TenantContext } from "./context";
import {
  addDays,
  atHourIST,
  balance,
  dateLabel,
  dayString,
  daysBetween,
  money,
  nextDeliveryStatus,
  todayIST,
} from "./domain";
import { audit, memberFilter } from "./services";
import { DeliveryError, providerSend } from "./whatsapp";
import { hashToken } from "./security";
import { manualWhatsApp, requireCloudWhatsApp } from "./whatsapp-mode";
import { hasWorkspaceAccess } from "./workspace-access";

export async function recipients(
  ctx: TenantContext,
  segment: string,
  selected: string[] = [],
) {
  ownerOnly(ctx);
  await assertActive(ctx);
  if (!["all", "active", "expiring", "expired", "selected"].includes(segment))
    throw new Error("Choose a recipient segment.");
  if (segment === "selected" && (!selected.length || selected.length > 2000))
    throw new Error("Select between 1 and 2,000 members.");
  const members = await db.member.findMany({
    where: {
      ...memberFilter(ctx.businessId, "", segment),
      ...(segment === "selected" ? { id: { in: selected } } : {}),
    },
    include: { contact: true },
  });
  if (segment === "selected" && members.length !== new Set(selected).size)
    throw new Error("One or more selected members are unavailable.");
  return members;
}
export async function previewCampaign(
  ctx: TenantContext,
  templateId: string,
  segment: string,
  selected: string[] = [],
) {
  const template = await db.messageTemplate.findFirst({
    where: {
      id: templateId,
      businessId: ctx.businessId,
      status: "APPROVED",
      purpose: "ANNOUNCEMENT",
    },
  });
  if (
    !template ||
    template.parameterKeys.some((k) => !k) ||
    !["UTILITY", "MARKETING"].includes(template.category)
  )
    throw new Error("Choose an approved, mapped announcement template.");
  const members = await recipients(ctx, segment, selected);
  const eligible = members.filter((m) => !m.contact.optedOutAt);
  const phones = new Set<string>();
  return {
    template,
    recipients: eligible.filter((m) => {
      if (phones.has(m.contact.phone)) return false;
      phones.add(m.contact.phone);
      return true;
    }),
    total: members.length,
    excluded: members.length - phones.size,
  };
}
export async function createCampaign(
  ctx: TenantContext,
  input: {
    name: string;
    templateId: string;
    segment: string;
    selected: string[];
    scheduledAt: Date;
    expectedCount: number;
    requestId: string;
  },
) {
  requireCloudWhatsApp();
  ownerOnly(ctx);
  await assertActive(ctx);
  if (input.name.trim().length < 3 || input.name.length > 100)
    throw new Error("Enter a campaign name (3–100 characters).");
  if (
    !Number.isFinite(input.scheduledAt.getTime()) ||
    input.scheduledAt < new Date(Date.now() - 60000) ||
    input.scheduledAt > addDays(new Date(), 90)
  )
    throw new Error("Schedule the campaign within the next 90 days.");
  const preview = await previewCampaign(
    ctx,
    input.templateId,
    input.segment,
    input.selected,
  );
  if (!preview.recipients.length)
    throw new Error(
      "No members in this segment are available for WhatsApp messages.",
    );
  if (preview.recipients.length !== input.expectedCount)
    throw new Error("The recipient count changed. Preview the campaign again.");
  const connection = await db.whatsAppConnection.findUnique({
    where: { businessId: ctx.businessId },
  });
  if (!connection || !["ACTIVE", "DEMO"].includes(connection.status))
    throw new Error("Connect WhatsApp before scheduling a campaign.");
  const campaignId = hashToken(`${ctx.businessId}:${input.requestId}`);
  const prior = await db.campaign.findFirst({
    where: { id: campaignId, businessId: ctx.businessId },
  });
  if (prior) return prior;
  return db.$transaction(
    async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          id: campaignId,
          businessId: ctx.businessId,
          name: input.name.trim(),
          templateId: input.templateId,
          segment: input.segment,
          scheduledAt: input.scheduledAt,
          recipientCount: preview.recipients.length,
        },
      });
      await tx.message.createMany({
        data: preview.recipients.map((m) => ({
          businessId: ctx.businessId,
          memberId: m.id,
          templateId: input.templateId,
          campaignId: campaign.id,
          kind: "ANNOUNCEMENT",
          phone: m.contact.phone,
          scheduledAt: input.scheduledAt,
          idempotencyKey: `${campaign.id}:${m.contact.phone}`,
        })),
      });
      await tx.auditLog.create({
        data: {
          businessId: ctx.businessId,
          actorId: ctx.userId,
          action: "CAMPAIGN_SCHEDULED",
          entityId: campaign.id,
          detail: `${preview.recipients.length} recipients`,
        },
      });
      return campaign;
    },
    { timeout: 60000 },
  );
}
export async function scheduleReminders(now = new Date()) {
  if (manualWhatsApp()) return 0;
  const today = todayIST(now);
  const businesses = await db.business.findMany({
    where: { status: "ACTIVE", remindersEnabled: true },
    include: {
      templates: { where: { status: "APPROVED", category: "UTILITY" } },
      connection: true,
    },
  });
  let scheduled = 0;
  for (const b of businesses) {
    if (!hasWorkspaceAccess(b, now)) continue;
    if (
      !b.connection ||
      !["ACTIVE", "DEMO"].includes(b.connection.status) ||
      now < atHourIST(today, b.reminderHour)
    )
      continue;
    const renewal = b.templates.find(
      (t) => t.purpose === "RENEWAL" && t.parameterKeys.every(Boolean),
    );
    const dues = b.templates.find(
      (t) => t.purpose === "DUES" && t.parameterKeys.every(Boolean),
    );
    const data: Prisma.MessageCreateManyInput[] = [];
    if (renewal && b.renewalOffsets.length) {
      const terms = await db.membership.findMany({
        where: {
          businessId: b.id,
          cancelledAt: null,
          startDate: { lte: today },
          endDate: { in: b.renewalOffsets.map((n) => addDays(today, n)) },
          member: {
            archived: false,
            contact: { optedOutAt: null },
          },
        },
        include: {
          member: {
            include: {
              contact: true,
              memberships: {
                where: { cancelledAt: null },
                select: { endDate: true },
              },
            },
          },
        },
      });
      for (const t of terms) {
        if (t.member.memberships.some((other) => other.endDate > t.endDate))
          continue;
        data.push({
          businessId: b.id,
          memberId: t.memberId,
          templateId: renewal.id,
          membershipId: t.id,
          kind: "RENEWAL",
          phone: t.member.contact.phone,
          scheduledAt: atHourIST(today, b.reminderHour),
          idempotencyKey: `renewal:${b.id}:${t.id}:${dayString(today)}`,
        });
      }
    }
    if (dues && b.duesOffsets.length) {
      const charges = await db.charge.findMany({
        where: {
          businessId: b.id,
          voidedAt: null,
          dueDate: { in: b.duesOffsets.map((n) => addDays(today, -n)) },
          member: {
            archived: false,
            contact: { optedOutAt: null },
          },
        },
        include: { payments: true, member: { include: { contact: true } } },
      });
      for (const c of charges) {
        if (balance(c) <= 0) continue;
        data.push({
          businessId: b.id,
          memberId: c.memberId,
          templateId: dues.id,
          chargeId: c.id,
          kind: "DUES",
          phone: c.member.contact.phone,
          scheduledAt: atHourIST(today, b.reminderHour),
          idempotencyKey: `dues:${b.id}:${c.id}:${dayString(today)}`,
        });
      }
    }
    if (data.length)
      scheduled += (await db.message.createMany({ data, skipDuplicates: true }))
        .count;
  }
  return scheduled;
}
export async function deliverMessage(
  id: string,
  send = providerSend,
  now = new Date(),
) {
  if (manualWhatsApp()) return;
  const message = await db.message.findUnique({
    where: { id },
    include: {
      business: { include: { connection: true } },
      member: { include: { contact: true } },
      template: true,
      campaign: true,
    },
  });
  if (!message || message.status !== "QUEUED" || message.scheduledAt > now)
    return;
  const { business: b, member: m, template: t } = message;
  const suppress = async (reason: string) =>
    db.message.updateMany({
      where: { id, status: "QUEUED" },
      data: { status: "SUPPRESSED", lastError: reason },
    });
  if (
    m.businessId !== b.id ||
    t.businessId !== b.id ||
    (message.campaign && message.campaign.businessId !== b.id)
  ) {
    await suppress("Business mismatch");
    return;
  }
  if (b.status !== "ACTIVE" || m.archived) {
    await suppress("Business or member inactive");
    return;
  }
  if (!hasWorkspaceAccess(b)) {
    await suppress("Paid plan required");
    return;
  }
  if (m.contact.phone !== message.phone || m.contact.optedOutAt) {
    await suppress("Contact opted out or phone number changed");
    return;
  }
  if (
    t.status !== "APPROVED" ||
    t.parameterKeys.some((k) => !k) ||
    !["UTILITY", "MARKETING"].includes(t.category)
  ) {
    await suppress("Template unavailable or not mapped");
    return;
  }
  if (message.campaign?.cancelledAt) {
    await suppress("Campaign cancelled");
    return;
  }
  if (
    message.kind !== "ANNOUNCEMENT" &&
    (!b.remindersEnabled ||
      daysBetween(todayIST(now), todayIST(message.scheduledAt)) > 0)
  ) {
    await suppress("Reminder disabled or stale");
    return;
  }
  const connection = b.connection;
  if (!connection || !["ACTIVE", "DEMO"].includes(connection.status)) {
    await suppress("WhatsApp disconnected");
    return;
  }
  let expiry = "—",
    amount = "—",
    due = "—";
  if (message.membershipId) {
    const term = await db.membership.findFirst({
      where: { id: message.membershipId, businessId: b.id, memberId: m.id },
    });
    if (!term || term.cancelledAt || term.endDate < todayIST(now)) {
      await suppress("Membership cancelled or expired");
      return;
    }
    const renewed = await db.membership.count({
      where: {
        businessId: b.id,
        memberId: m.id,
        cancelledAt: null,
        endDate: { gt: term.endDate },
      },
    });
    if (renewed) {
      await suppress("Membership already renewed");
      return;
    }
    expiry = dateLabel(term.endDate);
  }
  if (message.chargeId) {
    const charge = await db.charge.findFirst({
      where: { id: message.chargeId, businessId: b.id, memberId: m.id },
      include: { payments: true },
    });
    if (!charge || charge.voidedAt || balance(charge) <= 0) {
      await suppress("Balance settled or waived");
      return;
    }
    amount = money(balance(charge));
    due = dateLabel(charge.dueDate);
  }
  const values: Record<string, string> = {
    name: m.name,
    business: b.name,
    expiry,
    amount,
    due,
    date: dateLabel(now),
  };
  if (t.parameterKeys.some((k) => !(k in values))) {
    await suppress("Unsupported template parameter");
    return;
  }
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Serialize quota reservation and sender throttling across worker processes.
  const claimed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WhatsAppConnection" WHERE "businessId"=${b.id} FOR UPDATE`;
    const current = await tx.whatsAppConnection.findUniqueOrThrow({
      where: { businessId: b.id },
    });
    if (current.nextSendAt > now) return false;
    const used = await tx.message.count({
      where: { businessId: b.id, sentAt: { gte: month } },
    });
    if (used >= b.messageLimit) {
      await tx.message.updateMany({
        where: { id, status: "QUEUED" },
        data: {
          status: "SUPPRESSED",
          lastError: "Monthly message limit reached",
        },
      });
      return false;
    }
    const claim = await tx.message.updateMany({
      where: { id, status: "QUEUED" },
      data: { status: "PROCESSING", attempts: { increment: 1 }, sentAt: now },
    });
    if (!claim.count) return false;
    await tx.whatsAppConnection.update({
      where: { businessId: b.id },
      data: { nextSendAt: new Date(now.getTime() + 1200) },
    });
    return true;
  });
  if (!claimed) return;
  if (process.env.WHATSAPP_DRY_RUN === "true") {
    await db.message.update({
      where: { id },
      data: {
        status: "SIMULATED",
        lastError: "Development dry run. No WhatsApp message was sent.",
      },
    });
    return;
  }
  if (connection.status === "DEMO" || !t.providerId) {
    await db.message.update({
      where: { id },
      data: {
        status: "SUPPRESSED",
        sentAt: null,
        lastError: "Demo connection cannot send live messages",
      },
    });
    return;
  }
  try {
    const providerMessageId = await send(
      connection.phoneNumberId,
      connection.encryptedToken,
      message.phone,
      t,
      t.parameterKeys.map((k) => values[k]),
      id,
    );
    await db.message.updateMany({
      where: { id, status: { in: ["PROCESSING", "UNKNOWN"] } },
      data: { status: "SENT", providerMessageId, lastError: null },
    });
  } catch (e) {
    const error =
      e instanceof DeliveryError
        ? e
        : new DeliveryError(
            "Delivery outcome unknown. Review before retrying.",
            "unknown",
          );
    const retry = error.outcome === "retry" && message.attempts < 4;
    await db.message.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: retry
          ? "QUEUED"
          : error.outcome === "unknown"
            ? "UNKNOWN"
            : "FAILED",
        lastError: error.message,
        ...(retry
          ? {
              scheduledAt: new Date(
                now.getTime() + Math.pow(4, message.attempts + 1) * 60000,
              ),
              sentAt: null,
            }
          : {}),
      },
    });
  }
}
export async function recoverInterruptedMessages() {
  return db.message.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: new Date(Date.now() - 120000) },
    },
    data: {
      status: "UNKNOWN",
      lastError:
        "Worker interrupted during delivery. Review outcome before retrying.",
    },
  });
}

type StatusEvent = {
  id: string;
  status: string;
  timestamp?: string;
  biz_opaque_callback_data?: string;
  errors?: { code: number }[];
};
type Inbound = {
  id: string;
  from: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string } };
};
export async function processWebhook(payload: {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: StatusEvent[];
        messages?: Inbound[];
      };
    }[];
  }[];
}) {
  for (const entry of payload.entry ?? [])
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.metadata?.phone_number_id) continue;
      const connection = await db.whatsAppConnection.findUnique({
        where: { phoneNumberId: value.metadata.phone_number_id },
      });
      if (!connection) continue;
      for (const s of value.statuses ?? []) {
        if (!["sent", "delivered", "read", "failed"].includes(s.status))
          continue;
        const key = hashToken(
          `${connection.businessId}:${s.id}:${s.status}:${s.timestamp}`,
        );
        await db.$transaction(async (tx) => {
          if (
            !(
              await tx.webhookEvent.createMany({
                data: [{ key }],
                skipDuplicates: true,
              })
            ).count
          )
            return;
          const m = await tx.message.findFirst({
            where: {
              businessId: connection.businessId,
              OR: [
                { providerMessageId: s.id },
                ...(s.biz_opaque_callback_data
                  ? [{ id: s.biz_opaque_callback_data }]
                  : []),
              ],
            },
          });
          if (!m) {
            await tx.webhookEvent.delete({ where: { key } });
            return;
          }
          await tx.$queryRaw`SELECT id FROM "Message" WHERE id=${m.id} FOR UPDATE`;
          const current = await tx.message.findUniqueOrThrow({
            where: { id: m.id },
          });
          const status = nextDeliveryStatus(
            current.status,
            s.status.toUpperCase(),
          );
          const at =
            s.timestamp && Number.isFinite(Number(s.timestamp))
              ? new Date(Number(s.timestamp) * 1000)
              : new Date();
          await tx.message.update({
            where: { id: m.id },
            data: {
              status,
              providerMessageId: s.id,
              ...(s.status === "delivered" ? { deliveredAt: at } : {}),
              ...(s.status === "read"
                ? { readAt: at, deliveredAt: current.deliveredAt ?? at }
                : {}),
              ...(s.status === "failed" && status === "FAILED"
                ? {
                    lastError: `Meta delivery failed (${s.errors?.[0]?.code ?? "unknown"})`,
                  }
                : {}),
            },
          });
        });
      }
      for (const m of value.messages ?? []) {
        const text = (
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          ""
        )
          .trim()
          .toUpperCase();
        if (
          ![
            "STOP",
            "UNSUBSCRIBE",
            "OPT OUT",
            "OPTOUT",
            "CANCEL",
            "बंद",
          ].includes(text)
        )
          continue;
        await db.$transaction(async (tx) => {
          const key = hashToken(`inbound:${connection.businessId}:${m.id}`);
          if (
            !(
              await tx.webhookEvent.createMany({
                data: [{ key }],
                skipDuplicates: true,
              })
            ).count
          )
            return;
          const phone = "+" + m.from.replace(/^\+/, "");
          await tx.contact.updateMany({
            where: { businessId: connection.businessId, phone },
            data: {
              optedOutAt: new Date(),
              serviceConsent: false,
              marketingConsent: false,
            },
          });
          await tx.message.updateMany({
            where: {
              businessId: connection.businessId,
              phone,
              status: "QUEUED",
            },
            data: { status: "SUPPRESSED", lastError: "Member opted out" },
          });
          await tx.auditLog.create({
            data: {
              businessId: connection.businessId,
              actorId: "whatsapp-webhook",
              action: "CONTACT_OPTED_OUT",
              detail: "Opt-out received through WhatsApp",
            },
          });
        });
      }
    }
}
