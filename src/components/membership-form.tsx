"use client";
import { useActionState, useState } from "react";
import { mutate } from "@/app/actions";
import { FormNotice, initialActionState, SubmitButton } from "./action-form";
import { Input, NativeSelect } from "./ui/input";
import { dayString, money, parseDay, termEnd } from "@/lib/domain";
import {
  calculateMembershipBill,
  parseDiscount,
  type DiscountType,
} from "@/lib/membership-billing";
import { ChargeBreakdown } from "./charge-breakdown";
type Plan = {
  id: string;
  name: string;
  months: number;
  amountPaise: number;
  admissionFeePaise: number;
  taxRateBps: number;
  taxInclusive: boolean;
};
type FieldsProps = {
  memberId: string;
  plans: Plan[];
  start: string;
  today: string;
  firstMembership: boolean;
};
// The fields reset whenever `resetKey` changes (a new term moves the renewal
// start date). The action state lives here, outside the keyed fields, because
// the action result and the refreshed page arrive in the same render: state
// held inside the fields would be discarded before the message is shown.
export function MembershipForm({
  resetKey,
  ...props
}: FieldsProps & { resetKey: string }) {
  const [state, formAction] = useActionState(mutate, initialActionState);
  return (
    <div className="space-y-3">
      {state.message && <FormNotice ok={state.ok} message={state.message} />}
      <MembershipFields key={resetKey} {...props} formAction={formAction} />
    </div>
  );
}
function MembershipFields({
  memberId,
  plans,
  start,
  today,
  firstMembership,
  formAction,
}: FieldsProps & { formAction: (formData: FormData) => void }) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? ""),
    [startDate, setStart] = useState(start),
    [customEnd, setEnd] = useState("");
  const [includeAdmissionFee, setIncludeAdmissionFee] =
    useState(firstMembership);
  const [discountType, setDiscountType] = useState<DiscountType>("NONE");
  const [discountValue, setDiscountValue] = useState("");
  const plan = plans.find((p) => p.id === planId);
  let bill: ReturnType<typeof calculateMembershipBill> | undefined;
  let billingError = "";
  try {
    if (plan)
      bill = calculateMembershipBill({
        baseAmountPaise: plan.amountPaise,
        admissionFeePaise:
          firstMembership && includeAdmissionFee ? plan.admissionFeePaise : 0,
        taxRateBps: plan.taxRateBps,
        taxInclusive: plan.taxInclusive,
        ...parseDiscount(discountType, discountValue),
      });
  } catch (error) {
    billingError =
      error instanceof Error ? error.message : "Review the billing amounts.";
  }
  let end = customEnd;
  try {
    if (!end && plan && startDate)
      end = dayString(termEnd(parseDay(startDate), plan.months));
  } catch {}
  if (!plans.length)
    return (
      <p className="text-sm text-muted-foreground">
        Ask an owner to create a membership plan first.
      </p>
    );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="_action" value="membership" />
      <input type="hidden" name="memberId" value={memberId} />
      <input
        type="hidden"
        name="includeAdmissionFee"
        value={String(firstMembership && includeAdmissionFee)}
      />
      <input
        type="hidden"
        name="expectedAmountPaise"
        value={bill?.amountPaise ?? -1}
      />
      <label className="field">
        Membership plan
        <NativeSelect
          name="planId"
          value={planId}
          onChange={(e) => {
            setPlanId(e.target.value);
            setEnd("");
          }}
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {money(p.amountPaise)}
            </option>
          ))}
        </NativeSelect>
      </label>
      <div className="form-grid">
        <label className="field">
          Start date
          <Input
            required
            type="date"
            name="startDate"
            value={startDate}
            onChange={(e) => {
              setStart(e.target.value);
              setEnd("");
            }}
          />
        </label>
        <label className="field">
          End date
          <Input
            required
            type="date"
            name="endDate"
            value={end}
            min={startDate}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        Fee due date
        <Input required type="date" name="dueDate" defaultValue={today} />
      </label>
      {firstMembership && (plan?.admissionFeePaise ?? 0) > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeAdmissionFee}
            onChange={(e) => setIncludeAdmissionFee(e.target.checked)}
          />
          Include admission fee ({money(plan!.admissionFeePaise)})
        </label>
      )}
      {!firstMembership && (plan?.admissionFeePaise ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          Admission fees do not apply to renewals.
        </p>
      )}
      <div className="form-grid">
        <label className="field">
          Discount
          <NativeSelect
            name="discountType"
            value={discountType}
            onChange={(e) => {
              setDiscountType(e.target.value as DiscountType);
              setDiscountValue("");
            }}
          >
            <option value="NONE">No discount</option>
            <option value="FIXED">Fixed amount (₹)</option>
            <option value="PERCENT">Percentage (%)</option>
          </NativeSelect>
        </label>
        {discountType !== "NONE" && (
          <label className="field">
            {discountType === "PERCENT"
              ? "Discount (%)"
              : "Discount amount (₹)"}
            <Input
              name="discountValue"
              required
              type="number"
              min="0"
              max={discountType === "PERCENT" ? "100" : undefined}
              step="0.01"
              inputMode="decimal"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </label>
        )}
      </div>
      {discountType !== "NONE" && (
        <>
          <label className="field">
            Discount reason
            <Input
              name="discountReason"
              required={Number(discountValue) > 0}
              minLength={3}
              maxLength={200}
              placeholder="e.g. Joining offer"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Discount applies to the membership and admission subtotal before tax
            is calculated.
          </p>
        </>
      )}
      <div className="rounded-lg bg-muted p-3" aria-live="polite">
        {bill ? (
          <ChargeBreakdown bill={bill} />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {billingError}
          </p>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Activating creates this charge. Record payment separately when received.
      </p>
      <SubmitButton>Activate membership</SubmitButton>
    </form>
  );
}
