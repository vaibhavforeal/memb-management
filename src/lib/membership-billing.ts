import { toPaise } from "./domain";

export const MAX_CHARGE_PAISE = 999999999;
export type DiscountType = "NONE" | "FIXED" | "PERCENT";
export type BillingInput = {
  baseAmountPaise: number;
  admissionFeePaise?: number;
  taxRateBps?: number;
  taxInclusive?: boolean;
  discountType?: DiscountType;
  // Fixed discounts use paise; percentage discounts use basis points.
  discountValue?: number;
};

export function percentageBps(value: string) {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error(
      "Enter a percentage from 0 to 100 with up to two decimals.",
    );
  const bps = toPaise(value);
  if (bps > 10000) throw new Error("Enter a percentage from 0 to 100.");
  return bps;
}

export function parseDiscount(type = "NONE", value = "0") {
  if (!["NONE", "FIXED", "PERCENT"].includes(type))
    throw new Error("Choose a valid discount type.");
  return {
    discountType: type as DiscountType,
    discountValue:
      type === "NONE"
        ? 0
        : type === "PERCENT"
          ? percentageBps(value || "0")
          : toPaise(value || "0"),
  };
}

export function calculateMembershipBill(input: BillingInput) {
  const {
    baseAmountPaise,
    admissionFeePaise = 0,
    taxRateBps = 0,
    taxInclusive = false,
    discountType = "NONE",
    discountValue = 0,
  } = input;
  for (const value of [baseAmountPaise, admissionFeePaise, discountValue]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CHARGE_PAISE)
      throw new Error("Fees and discounts must be valid non-negative amounts.");
  }
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000)
    throw new Error("Tax must be between 0 and 100%.");
  if (typeof taxInclusive !== "boolean")
    throw new Error("Choose a valid tax mode.");
  if (!["NONE", "FIXED", "PERCENT"].includes(discountType))
    throw new Error("Choose a valid discount type.");
  if (discountType === "PERCENT" && discountValue > 10000)
    throw new Error("Discount cannot exceed 100%.");
  if (discountType === "NONE" && discountValue !== 0)
    throw new Error("Choose a discount type for this value.");
  const subtotalPaise = baseAmountPaise + admissionFeePaise;
  const discountPaise =
    discountType === "PERCENT"
      ? Math.round((subtotalPaise * discountValue) / 10000)
      : discountType === "FIXED"
        ? discountValue
        : 0;
  if (discountPaise > subtotalPaise)
    throw new Error("Discount cannot exceed the fee subtotal.");
  const discountedPaise = subtotalPaise - discountPaise;
  // Round once to the nearest paise. All products remain safe integers.
  const taxPaise = Math.round(
    (discountedPaise * taxRateBps) /
      (taxInclusive ? 10000 + taxRateBps : 10000),
  );
  const amountPaise = discountedPaise + (taxInclusive ? 0 : taxPaise);
  if (amountPaise > MAX_CHARGE_PAISE)
    throw new Error("The charge total exceeds the supported amount.");
  return {
    baseAmountPaise,
    admissionFeePaise,
    discountType,
    discountValue,
    discountPaise,
    taxRateBps,
    taxInclusive,
    taxPaise,
    amountPaise,
  };
}
