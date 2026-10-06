"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import {
  checkInMemberQr,
  issueMemberQr,
  lookupMemberQr,
  MemberQrError,
} from "@/lib/member-qr";
import { PlanRequiredError } from "@/lib/workspace-access";

function failure(error: unknown) {
  if (error && typeof error === "object" && "digest" in error) throw error;
  return {
    ok: false as const,
    message:
      error instanceof MemberQrError || error instanceof PlanRequiredError
        ? error.message
        : "Unable to process this QR. Check your access and try again.",
  };
}

export async function createQrCard(memberId: string, replace = false) {
  try {
    const card = await issueMemberQr(await getContext(), memberId, replace);
    revalidatePath(`/member-card/${memberId}`);
    return { ok: true as const, card };
  } catch (error) {
    return failure(error);
  }
}

export async function scanQrCard(payload: string) {
  try {
    return {
      ok: true as const,
      member: await lookupMemberQr(await getContext(), payload),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmQrCheckIn(payload: string) {
  try {
    const result = await checkInMemberQr(await getContext(), payload);
    revalidatePath("/attendance");
    revalidatePath("/dashboard");
    revalidatePath("/members", "layout");
    return {
      ok: true as const,
      message: `${result.name} ${result.alreadyCheckedIn ? "was already checked in today" : "is checked in for today"}.`,
    };
  } catch (error) {
    return failure(error);
  }
}
