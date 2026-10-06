"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getContext,
  currentUser,
  requireAdmin,
  ownerOnly,
  assertActive,
} from "@/lib/context";
import {
  audit,
  cancelMembership,
  checkIn,
  createMembership,
  importMembers,
  memberFor,
  recordPayment,
  reversePayment,
  saveMember,
  savePlan,
  waiveCharge,
} from "@/lib/services";
import { connectWhatsApp, mapTemplate, syncTemplates } from "@/lib/whatsapp";
import { createCampaign, previewCampaign } from "@/lib/messaging";
import { toPaise, type MemberInput } from "@/lib/domain";
import { acceptInvitation, createBusiness, inviteStaff } from "@/lib/admin";
import { hashToken, secretToken } from "@/lib/security";
import { sendEmail } from "@/lib/mail";
import { manualWhatsApp, requireCloudWhatsApp } from "@/lib/whatsapp-mode";
import { recordManualSend } from "@/lib/manual-whatsapp";
import { saveBusinessFee } from "@/lib/business-billing";
import { completeGoogleSignup } from "@/lib/signup";

export type ActionState = {
  ok: boolean;
  message: string;
  redirectTo?: string;
  count?: number;
  excluded?: number;
  body?: string;
};
const field = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
async function selectWorkspace(businessId: string) {
  const jar = await cookies();
  jar.delete("membrr-support");
  jar.set("membrr-business", businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
export async function mutate(
  _previous: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    const op = field(f, "_action");
    if (op === "complete-google-signup") {
      const user = await currentUser();
      await completeGoogleSignup(user.id, Object.fromEntries(f));
      return {
        ok: true,
        message: "Workspace created.",
        redirectTo: "/dashboard",
      };
    }
    if (op === "accept-invite") {
      await acceptInvitation(field(f, "token"), field(f, "password"));
      return {
        ok: true,
        message: "Account created. You can now sign in.",
        redirectTo: "/login",
      };
    }
    if (op.startsWith("admin-")) {
      const admin = await requireAdmin();
      const businessId = field(f, "businessId");
      if (op === "admin-create") {
        const business = await createBusiness(
          admin.id,
          field(f, "name"),
          field(f, "city"),
        );
        await selectWorkspace(business.id);
        revalidatePath("/admin");
        return {
          ok: true,
          message: "Workspace created.",
          redirectTo: "/dashboard",
        };
      } else if (op === "admin-open") {
        const access = await db.staffAccess.findUnique({
          where: { businessId_userId: { businessId, userId: admin.id } },
        });
        if (access?.role !== "OWNER")
          throw new Error("Owner access is required to open this workspace.");
        await selectWorkspace(businessId);
        return {
          ok: true,
          message: "Workspace opened.",
          redirectTo: "/dashboard",
        };
      } else if (op === "admin-billing") {
        await saveBusinessFee(admin.id, businessId, field(f, "monthlyFee"));
        revalidatePath("/billing");
      } else if (op === "admin-status") {
        const b = await db.business.findUniqueOrThrow({
          where: { id: businessId },
        });
        await db.$transaction([
          db.business.update({
            where: { id: b.id },
            data: { status: b.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" },
          }),
          db.auditLog.create({
            data: {
              businessId,
              actorId: admin.id,
              action: "BUSINESS_STATUS_CHANGED",
              detail: b.status === "ACTIVE" ? "Suspended" : "Activated",
            },
          }),
        ]);
      } else if (op === "admin-support") {
        const reason = field(f, "reason");
        if (reason.length < 10 || reason.length > 500)
          throw new Error(
            "Record the reason for support access (10–500 characters).",
          );
        await db.business.findUniqueOrThrow({ where: { id: businessId } });
        const expiresAt = new Date(Date.now() + 30 * 60000);
        const grant = await db.supportGrant.create({
          data: { actorId: admin.id, businessId, reason, expiresAt },
        });
        await db.auditLog.create({
          data: {
            businessId,
            actorId: admin.id,
            action: "SUPPORT_ACCESS_GRANTED",
            detail: reason,
          },
        });
        (await cookies()).set("membrr-support", grant.id, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          expires: expiresAt,
        });
        return {
          ok: true,
          message: "Audited support access started for 30 minutes.",
          redirectTo: "/dashboard",
        };
      } else if (op === "admin-resend") {
        const i = await db.invitation.findFirst({
          where: { businessId, acceptedAt: null },
          orderBy: { createdAt: "desc" },
        });
        if (!i) throw new Error("No pending invitation found.");
        const token = secretToken();
        await db.invitation.update({
          where: { id: i.id },
          data: {
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
        });
        await sendEmail(
          i.email,
          "Your membrr invitation",
          `${process.env.BETTER_AUTH_URL}/invite/${token}`,
        );
      } else throw new Error("Unknown administrator action.");
      revalidatePath("/admin");
      return { ok: true, message: "Workspace updated." };
    }
    if (op === "end-support") {
      const admin = await requireAdmin();
      const jar = await cookies();
      const grantId = jar.get("membrr-support")?.value;
      if (grantId)
        await db.supportGrant.updateMany({
          where: { id: grantId, actorId: admin.id },
          data: { expiresAt: new Date() },
        });
      jar.delete("membrr-support");
      return {
        ok: true,
        message: "Support access ended.",
        redirectTo: "/admin",
      };
    }
    const ctx = await getContext();
    await assertActive(ctx);
    if (
      [
        "connect-whatsapp",
        "sync-templates",
        "map-template",
        "preview-campaign",
        "campaign",
      ].includes(op)
    )
      requireCloudWhatsApp();
    let message = "Changes saved.",
      redirectTo: string | undefined;
    if (op === "manual-send") {
      await recordManualSend(ctx, {
        memberId: field(f, "memberId"),
        phone: field(f, "phone"),
        kind: field(f, "kind"),
        body: field(f, "body"),
        requestId: field(f, "requestId"),
        confirmed: field(f, "confirmed") === "true",
      });
      message = "Recorded as sent manually. WhatsApp delivery is not verified.";
    } else if (op === "save-member") {
      const m = await saveMember(
        ctx,
        {
          name: field(f, "name"),
          phone: field(f, "phone"),
          email: field(f, "email"),
          notes: field(f, "notes"),
        },
        field(f, "memberId") || undefined,
      );
      message = "Member saved.";
      redirectTo = `/members/${m.id}`;
    } else if (op === "import") {
      const input = JSON.parse(field(f, "rows")) as MemberInput[];
      const result = await importMembers(ctx, input);
      message = `${result.created} members imported; ${result.skipped} existing members skipped.`;
    } else if (op === "membership") {
      const term = await createMembership(ctx, {
        memberId: field(f, "memberId"),
        planId: field(f, "planId"),
        startDate: field(f, "startDate"),
        endDate: field(f, "endDate"),
        dueDate: field(f, "dueDate"),
        includeAdmissionFee: field(f, "includeAdmissionFee") === "true",
        discountType: field(f, "discountType") || "NONE",
        discountValue: field(f, "discountValue") || "0",
        discountReason: field(f, "discountReason"),
        expectedAmountPaise: f.has("expectedAmountPaise")
          ? Number(field(f, "expectedAmountPaise"))
          : undefined,
      });
      message = "Membership activated and charge created.";
      redirectTo = `/members/${term.memberId}`;
    } else if (op === "cancel-membership") {
      await cancelMembership(ctx, field(f, "membershipId"));
      message = "Membership cancelled. Any unpaid charges remain due.";
    } else if (op === "payment") {
      const p = await recordPayment(ctx, {
        chargeId: field(f, "chargeId"),
        amountPaise: toPaise(field(f, "amount")),
        method: field(f, "method"),
        reference: field(f, "reference"),
        idempotencyKey: field(f, "requestId"),
      });
      message = "Payment recorded.";
      redirectTo = `/receipts/${p.id}`;
    } else if (op === "reverse-payment") {
      await reversePayment(ctx, field(f, "paymentId"), field(f, "reason"));
      message = "Payment reversed. The original entry remains in the ledger.";
    } else if (op === "waive-charge") {
      await waiveCharge(ctx, field(f, "chargeId"), field(f, "reason"));
      message = "Charge waived.";
    } else if (op === "checkin") {
      await checkIn(ctx, field(f, "memberId"));
      message = "Checked in for today.";
    } else if (op === "archive") {
      ownerOnly(ctx);
      const m = await memberFor(ctx, field(f, "memberId"));
      await db.member.update({
        where: { id: m.id },
        data: { archived: !m.archived },
      });
      await audit(ctx, "MEMBER_ARCHIVE_CHANGED", m.id, String(!m.archived));
    } else if (op === "plan") {
      await savePlan(ctx, {
        id: field(f, "planId") || undefined,
        name: field(f, "name"),
        months: field(f, "months"),
        amount: field(f, "amount"),
        admissionFee: field(f, "admissionFee"),
        taxRate: field(f, "taxRate"),
        taxMode: field(f, "taxMode") || "EXCLUSIVE",
      });
    } else if (op === "toggle-plan") {
      ownerOnly(ctx);
      const p = await db.plan.findUniqueOrThrow({
        where: {
          businessId_id: { businessId: ctx.businessId, id: field(f, "planId") },
        },
      });
      await db.plan.update({
        where: { id: p.id },
        data: { active: !p.active },
      });
    } else if (op === "settings") {
      ownerOnly(ctx);
      const contactDetails = z
        .object({
          phone: z
            .string()
            .trim()
            .max(40)
            .regex(/^[\d+()\s-]*$/, "Enter a valid business phone number."),
          address: z.string().trim().max(500),
        })
        .parse({ phone: field(f, "phone"), address: field(f, "address") });
      if (manualWhatsApp()) {
        const parsed = z
          .object({
            name: z.string().min(2).max(100),
            city: z.string().min(2).max(100),
          })
          .parse({ name: field(f, "name"), city: field(f, "city") });
        await db.business.update({
          where: { id: ctx.businessId },
          data: { ...parsed, ...contactDetails },
        });
        await audit(
          ctx,
          "SETTINGS_UPDATED",
          ctx.businessId,
          "Business details updated",
        );
        revalidatePath("/", "layout");
        return {
          ok: true,
          message: "Business details saved. WhatsApp sending remains manual.",
        };
      }
      const offsets = (key: string) => {
        const v = field(f, key);
        if (!v) return [];
        const nums = v.split(",").map((n) => Number(n.trim()));
        if (
          nums.length > 8 ||
          nums.some((n) => !Number.isInteger(n) || n < 0 || n > 90)
        )
          throw new Error(
            "Reminder offsets must be 0–90 days, with at most 8 entries.",
          );
        return [...new Set(nums)];
      };
      const parsed = z
        .object({
          name: z.string().min(2).max(100),
          city: z.string().min(2).max(100),
          reminderHour: z.coerce.number().int().min(8).max(20),
        })
        .parse({
          name: field(f, "name"),
          city: field(f, "city"),
          reminderHour: field(f, "reminderHour"),
        });
      await db.business.update({
        where: { id: ctx.businessId },
        data: {
          ...parsed,
          ...contactDetails,
          renewalOffsets: offsets("renewalOffsets"),
          duesOffsets: offsets("duesOffsets"),
          remindersEnabled: f.get("remindersEnabled") === "on",
        },
      });
      await audit(
        ctx,
        "SETTINGS_UPDATED",
        ctx.businessId,
        "Business details and reminders updated",
      );
    } else if (op === "invite") {
      await inviteStaff(
        ctx,
        field(f, "name"),
        field(f, "email"),
        field(f, "role"),
      );
      message = "Invitation sent.";
    } else if (op === "remove-staff") {
      ownerOnly(ctx);
      const id = field(f, "accessId");
      const target = await db.staffAccess.findFirst({
        where: { id, businessId: ctx.businessId },
      });
      if (!target || target.userId === ctx.userId)
        throw new Error("You cannot remove your own access.");
      if (
        target.role === "OWNER" &&
        (await db.staffAccess.count({
          where: { businessId: ctx.businessId, role: "OWNER" },
        })) <= 1
      )
        throw new Error("At least one owner must remain.");
      await db.staffAccess.delete({ where: { id } });
      await audit(ctx, "STAFF_REMOVED", target.userId, target.role);
    } else if (op === "connect-whatsapp") {
      await connectWhatsApp(ctx, {
        phoneNumberId: field(f, "phoneNumberId"),
        accountId: field(f, "accountId"),
        token: field(f, "token"),
      });
      message = "Connection verified. Sync templates next.";
    } else if (op === "disconnect-whatsapp") {
      ownerOnly(ctx);
      await db.whatsAppConnection.update({
        where: { businessId: ctx.businessId },
        data: { status: "DISCONNECTED", encryptedToken: "" },
      });
      message = "WhatsApp disconnected.";
    } else if (op === "sync-templates") {
      message = `${await syncTemplates(ctx)} templates synced.`;
    } else if (op === "map-template") {
      await mapTemplate(
        ctx,
        field(f, "templateId"),
        field(f, "purpose"),
        field(f, "keys")
          ? field(f, "keys")
              .split(",")
              .map((s) => s.trim())
          : [],
      );
    } else if (op === "preview-campaign") {
      const p = await previewCampaign(
        ctx,
        field(f, "templateId"),
        field(f, "segment"),
        field(f, "selected").split(",").filter(Boolean),
      );
      return {
        ok: true,
        message: `${p.recipients.length} recipients ready; ${p.excluded} excluded for opt-outs or shared phone numbers.`,
        count: p.recipients.length,
        excluded: p.excluded,
        body: p.template.body,
      };
    } else if (op === "campaign") {
      const c = await createCampaign(ctx, {
        name: field(f, "name"),
        templateId: field(f, "templateId"),
        segment: field(f, "segment"),
        selected: field(f, "selected").split(",").filter(Boolean),
        scheduledAt: field(f, "scheduledAt")
          ? new Date(field(f, "scheduledAt") + "+05:30")
          : new Date(),
        expectedCount: Number(field(f, "expectedCount")),
        requestId: z.uuid().parse(field(f, "requestId")),
      });
      message = `Campaign scheduled for ${c.recipientCount} members.`;
      redirectTo = "/whatsapp";
    } else if (op === "cancel-campaign") {
      ownerOnly(ctx);
      const id = field(f, "campaignId");
      await db.campaign.update({
        where: { businessId_id: { businessId: ctx.businessId, id } },
        data: { cancelledAt: new Date() },
      });
      await db.message.updateMany({
        where: { businessId: ctx.businessId, campaignId: id, status: "QUEUED" },
        data: { status: "SUPPRESSED", lastError: "Campaign cancelled" },
      });
    } else throw new Error("Unknown action.");
    revalidatePath("/", "layout");
    return { ok: true, message, redirectTo };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (error instanceof z.ZodError)
      return {
        ok: false,
        error: undefined,
        message: error.issues.map((i) => i.message).join(" "),
      } as ActionState;
    const message =
      error instanceof Error
        ? error.message
        : "Unable to save. Please try again.";
    // Never surface Prisma query internals or credentials to clients.
    return {
      ok: false,
      message:
        /prisma|Invalid .*invocation|Unique constraint|Foreign key|connect.*database/i.test(
          message,
        )
          ? "This change could not be saved. Check for duplicate records and try again."
          : message,
    };
  }
}
