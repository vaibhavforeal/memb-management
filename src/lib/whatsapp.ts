import { db } from "./db";
import { decrypt, encrypt } from "./security";
import { assertActive, ownerOnly, type TenantContext } from "./context";
import { allowedParameters } from "./domain";
import { audit } from "./services";
import { requireCloudWhatsApp } from "./whatsapp-mode";

const graph = () =>
  `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v25.0"}`;
export class DeliveryError extends Error {
  constructor(
    message: string,
    public outcome: "retry" | "failed" | "unknown",
  ) {
    super(message);
  }
}
async function graphGet(path: string, token: string) {
  requireCloudWhatsApp();
  const response = await fetch(`${graph()}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      `Meta rejected the request (code ${body.error?.code ?? response.status}). Check account access and token permissions.`,
    );
  return body;
}
export async function connectWhatsApp(
  ctx: TenantContext,
  input: { phoneNumberId: string; accountId: string; token: string },
) {
  ownerOnly(ctx);
  await assertActive(ctx);
  if (
    !/^\d{5,30}$/.test(input.phoneNumberId) ||
    !/^\d{5,30}$/.test(input.accountId) ||
    input.token.length < 20
  )
    throw new Error(
      "Enter the phone number ID, WhatsApp account ID, and access token from Meta.",
    );
  const [phone, numbers] = await Promise.all([
    graphGet(
      `${input.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      input.token,
    ),
    graphGet(
      `${input.accountId}/phone_numbers?fields=id&limit=100`,
      input.token,
    ),
  ]);
  if (!numbers.data?.some((p: { id: string }) => p.id === input.phoneNumberId))
    throw new Error(
      "The phone number does not belong to this WhatsApp account.",
    );
  const fields = {
    phoneNumberId: input.phoneNumberId,
    accountId: input.accountId,
    encryptedToken: encrypt(input.token),
    displayPhone: phone.display_phone_number,
    status: "ACTIVE",
    lastError: null,
    checkedAt: new Date(),
  };
  await db.whatsAppConnection.upsert({
    where: { businessId: ctx.businessId },
    create: { businessId: ctx.businessId, ...fields },
    update: fields,
  });
  await db.messageTemplate.updateMany({
    where: { businessId: ctx.businessId },
    data: { status: "PENDING_SYNC" },
  });
  await audit(
    ctx,
    "WHATSAPP_CONNECTED",
    input.phoneNumberId,
    "Credentials verified and stored encrypted. Template sync required.",
  );
}
type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: { type: string; text?: string; buttons?: unknown[] }[];
};
export async function syncTemplates(ctx: TenantContext) {
  ownerOnly(ctx);
  await assertActive(ctx);
  const connection = await db.whatsAppConnection.findUnique({
    where: { businessId: ctx.businessId },
  });
  if (!connection || connection.status !== "ACTIVE")
    throw new Error("Connect a live WhatsApp Business account first.");
  let after = "",
    count = 0;
  const found: string[] = [];
  try {
    do {
      const result = await graphGet(
        `${connection.accountId}/message_templates?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
        decrypt(connection.encryptedToken),
      );
      for (const t of result.data as MetaTemplate[]) {
        const body = t.components.find((c) => c.type === "BODY")?.text ?? "";
        const placeholders = [
          ...new Set([...body.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1])),
        ];
        const supported =
          placeholders.every((p, i) => p === String(i + 1)) &&
          !t.components.some(
            (c) =>
              (c.type === "HEADER" && (!c.text || c.text.includes("{{"))) ||
              c.type === "BUTTONS",
          );
        const old = await db.messageTemplate.findUnique({
          where: {
            businessId_name_language: {
              businessId: ctx.businessId,
              name: t.name,
              language: t.language,
            },
          },
        });
        const keys =
          old?.parameterKeys.length === placeholders.length
            ? old.parameterKeys
            : placeholders.map(() => "");
        const status = supported ? t.status : "UNSUPPORTED";
        await db.messageTemplate.upsert({
          where: {
            businessId_name_language: {
              businessId: ctx.businessId,
              name: t.name,
              language: t.language,
            },
          },
          create: {
            businessId: ctx.businessId,
            name: t.name,
            language: t.language,
            category: t.category,
            status,
            body,
            parameterKeys: keys,
            providerId: t.id,
          },
          update: {
            body,
            category: t.category,
            status,
            parameterKeys: keys,
            providerId: t.id,
          },
        });
        found.push(t.id);
        count++;
      }
      after = result.paging?.next ? (result.paging?.cursors?.after ?? "") : "";
    } while (after && count < 1000);
    await db.messageTemplate.updateMany({
      where: {
        businessId: ctx.businessId,
        OR: [{ providerId: null }, { providerId: { notIn: found } }],
      },
      data: { status: "UNAVAILABLE" },
    });
    await db.whatsAppConnection.update({
      where: { id: connection.id },
      data: { checkedAt: new Date(), lastError: null },
    });
    await audit(
      ctx,
      "TEMPLATES_SYNCED",
      connection.id,
      `${count} templates refreshed`,
    );
    return count;
  } catch (e) {
    await db.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        lastError: e instanceof Error ? e.message : "Template sync failed",
      },
    });
    throw e;
  }
}
export async function mapTemplate(
  ctx: TenantContext,
  id: string,
  purpose: string,
  keys: string[],
) {
  ownerOnly(ctx);
  await assertActive(ctx);
  const template = await db.messageTemplate.findFirst({
    where: { id, businessId: ctx.businessId },
  });
  if (!template) throw new Error("Template not found.");
  const count = new Set(
    [...template.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]),
  ).size;
  if (keys.length !== count || keys.some((k) => !allowedParameters.includes(k)))
    throw new Error(`Map all ${count} template variables to supported fields.`);
  if (!["RENEWAL", "DUES", "ANNOUNCEMENT"].includes(purpose))
    throw new Error("Choose a template purpose.");
  if (purpose !== "ANNOUNCEMENT" && template.category !== "UTILITY")
    throw new Error("Automatic reminders require a utility template.");
  await db.$transaction(async (tx) => {
    if (purpose !== "ANNOUNCEMENT")
      await tx.messageTemplate.updateMany({
        where: { businessId: ctx.businessId, purpose },
        data: { purpose: "ANNOUNCEMENT" },
      });
    await tx.messageTemplate.update({
      where: { id },
      data: { purpose, parameterKeys: keys },
    });
  });
}
export async function providerSend(
  phoneNumberId: string,
  encryptedToken: string,
  recipient: string,
  template: { name: string; language: string },
  values: string[],
  messageId: string,
) {
  requireCloudWhatsApp();
  let response: Response;
  try {
    response = await fetch(`${graph()}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${decrypt(encryptedToken)}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient.replace("+", ""),
        type: "template",
        biz_opaque_callback_data: messageId,
        template: {
          name: template.name,
          language: { code: template.language },
          ...(values.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: values.map((text) => ({ type: "text", text })),
                  },
                ],
              }
            : {}),
        },
      }),
    });
  } catch {
    throw new DeliveryError(
      "No definitive response from Meta. Review the delivery outcome before retrying.",
      "unknown",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new DeliveryError(
      "Meta response could not be read; delivery outcome is unknown.",
      "unknown",
    );
  }
  if (!response.ok) {
    const code = Number(data.error?.code);
    if (response.status === 429 || [4, 80007, 130429, 131056].includes(code))
      throw new DeliveryError(`Meta rate limit (${code || 429})`, "retry");
    if (response.status >= 500)
      throw new DeliveryError(
        `Meta server error (${response.status}); delivery outcome is unknown.`,
        "unknown",
      );
    throw new DeliveryError(
      `Meta rejected this message (code ${code || response.status}).`,
      "failed",
    );
  }
  if (!data.messages?.[0]?.id)
    throw new DeliveryError(
      "Meta accepted the request without a message ID; review required.",
      "unknown",
    );
  return String(data.messages[0].id);
}
