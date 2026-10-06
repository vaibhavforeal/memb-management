"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/app/actions";
import { createBusiness } from "@/lib/admin";
import { saveBusinessFee } from "@/lib/business-billing";
import { requireConsoleAdmin } from "@/lib/console/guard";
import { trialDateLabel } from "@/lib/workspace-access";
import {
  extendTrial,
  grantSupportAccess,
  markPaidThrough,
  requireBusiness,
  resendInvitation,
  revokeUserSessions,
  setPlatformAdmin,
  toggleBusinessStatus,
} from "@/lib/console/mutations";

const field = (f: FormData, key: string) => String(f.get(key) ?? "").trim();

export async function consoleAction(
  _previous: ActionState,
  f: FormData,
): Promise<ActionState> {
  try {
    // Every branch, including unknown ones, requires a platform admin first.
    const admin = await requireConsoleAdmin();
    const op = field(f, "_action");
    const businessId = field(f, "businessId");
    let message = "Workspace updated.",
      redirectTo: string | undefined;
    if (op === "console-create") {
      const business = await createBusiness(
        admin.id,
        field(f, "name"),
        field(f, "city"),
      );
      message = "Workspace created.";
      redirectTo = `/workspaces/${business.id}`;
    } else if (op === "console-fee") {
      await requireBusiness(businessId);
      await saveBusinessFee(admin.id, businessId, field(f, "monthlyFee"));
      message = "Monthly fee saved.";
    } else if (op === "console-extend-trial") {
      const trialEndsAt = await extendTrial(
        admin.id,
        businessId,
        Number(field(f, "days")),
      );
      message = `Trial extended to ${trialDateLabel(trialEndsAt)}.`;
    } else if (op === "console-mark-paid") {
      await markPaidThrough(
        admin.id,
        businessId,
        field(f, "paidThrough"),
        field(f, "note"),
      );
      message = "Paid-through date saved.";
    } else if (op === "console-status") {
      const status = await toggleBusinessStatus(admin.id, businessId);
      message =
        status === "SUSPENDED"
          ? "Workspace suspended."
          : "Workspace activated.";
    } else if (op === "console-resend") {
      await resendInvitation(admin.id, businessId);
      message = "Invitation resent.";
    } else if (op === "console-support") {
      // Check before creating the grant so a misconfiguration leaves no grant or audit row.
      const mainUrl = process.env.BETTER_AUTH_URL;
      if (!mainUrl) throw new Error("Main site URL not configured.");
      const grant = await grantSupportAccess(
        admin.id,
        businessId,
        field(f, "reason"),
      );
      message = "Audited support access started for 30 minutes.";
      redirectTo = `${mainUrl}/support/start?grant=${grant.id}`;
    } else if (op === "console-admin") {
      const grant = field(f, "grant");
      if (grant !== "true" && grant !== "false")
        throw new Error("Choose whether to grant or revoke platform admin.");
      const changed = await setPlatformAdmin(
        admin.id,
        field(f, "userId"),
        grant === "true",
      );
      message = !changed
        ? "No change: the user already has that access."
        : grant === "true"
          ? "Platform admin granted."
          : "Platform admin revoked.";
    } else if (op === "console-signout-user") {
      const userId = field(f, "userId");
      const count = await revokeUserSessions(admin.id, userId);
      message = `${count} session${count === 1 ? "" : "s"} signed out.`;
      if (userId === admin.id) redirectTo = "/login";
    } else throw new Error("Unknown console action.");
    revalidatePath("/console", "layout");
    return { ok: true, message, redirectTo };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (error instanceof z.ZodError)
      return {
        ok: false,
        message: error.issues.map((i) => i.message).join(" "),
      };
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
