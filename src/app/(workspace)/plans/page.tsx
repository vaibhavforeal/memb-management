import { Plus } from "lucide-react";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { money } from "@/lib/domain";
import type { Plan } from "@prisma/client";
import { calculateMembershipBill } from "@/lib/membership-billing";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
function PlanForm({ plan }: { plan?: Plan }) {
  return (
    <ActionForm action="plan" submit={plan ? "Save plan" : "Create plan"}>
      <input type="hidden" name="planId" value={plan?.id ?? ""} />
      <label className="field">
        Plan name
        <Input
          required
          name="name"
          minLength={2}
          maxLength={80}
          defaultValue={plan?.name}
          placeholder="e.g. Quarterly Plus"
        />
      </label>
      <div className="form-grid">
        <label className="field">
          Duration (months)
          <Input
            name="months"
            required
            type="number"
            min={1}
            max={36}
            defaultValue={plan?.months ?? 1}
          />
        </label>
        <label className="field">
          Membership fee (₹)
          <Input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={plan ? plan.amountPaise / 100 : undefined}
            placeholder="2500"
          />
        </label>
      </div>
      <label className="field">
        Admission fee (₹)
        <Input
          name="admissionFee"
          required
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          defaultValue={(plan?.admissionFeePaise ?? 0) / 100}
        />
        <span className="text-xs font-normal text-muted-foreground">
          One-time fee on the first membership. Staff can skip it at admission.
        </span>
      </label>
      <div className="form-grid">
        <label className="field">
          Tax rate (%)
          <Input
            name="taxRate"
            required
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            defaultValue={(plan?.taxRateBps ?? 0) / 100}
          />
        </label>
        <label className="field">
          Tax treatment
          <NativeSelect
            name="taxMode"
            defaultValue={plan?.taxInclusive ? "INCLUSIVE" : "EXCLUSIVE"}
          >
            <option value="EXCLUSIVE">Add tax to fees</option>
            <option value="INCLUSIVE">Tax included in fees</option>
          </NativeSelect>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        The same tax rate applies to membership and admission fees after
        discounts. Set 0 for no tax.
      </p>
      {plan && (
        <p className="text-xs text-muted-foreground">
          Changes apply to new memberships only.
        </p>
      )}
    </ActionForm>
  );
}
export default async function PlansPage() {
  const ctx = await getContext();
  const plans = await db.plan.findMany({
    where: { businessId: ctx.businessId },
    include: { _count: { select: { memberships: true } } },
    orderBy: { months: "asc" },
  });
  return (
    <>
      <PageHeading
        title="Membership plans"

        action={
          ctx.role === "OWNER" && (
            <Dialog
              title="Create a membership plan"
              trigger={
                <Button>
                  <Plus />
                  New plan
                </Button>
              }
            >
              <PlanForm />
            </Dialog>
          )
        }
      />
      {plans.length > 0 && (
        <Card>
          <ul className="divide-y" aria-label="Membership plans">
            {plans.map((p) => (
              <li
                key={p.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 sm:flex sm:flex-wrap sm:gap-4"
              >
                <div className="min-w-0 sm:min-w-48 sm:flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h2 className="break-words text-sm font-semibold">
                      {p.name}
                    </h2>
                    <Badge>{p.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.months} {p.months === 1 ? "month" : "months"} ·{" "}
                    {p._count.memberships}{" "}
                    {p._count.memberships === 1 ? "term" : "terms"} recorded
                  </p>
                  {(p.admissionFeePaise > 0 || p.taxRateBps > 0) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.taxRateBps > 0
                        ? `${p.taxRateBps / 100}% tax ${p.taxInclusive ? "included" : "added to fees"}`
                        : "No tax"}
                      {p.admissionFeePaise > 0 &&
                        ` · ${money(p.admissionFeePaise)} admission${p.taxRateBps > 0 && !p.taxInclusive ? " + tax" : ""} on first membership`}
                    </p>
                  )}
                </div>
                <p className="whitespace-nowrap text-right text-lg font-semibold tabular-nums">
                  {money(
                    calculateMembershipBill({
                      baseAmountPaise: p.amountPaise,
                      taxRateBps: p.taxRateBps,
                      taxInclusive: p.taxInclusive,
                    }).amountPaise,
                  )}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    / term
                  </span>
                </p>
                {ctx.role === "OWNER" && (
                  <div className="col-span-2 flex flex-wrap items-start gap-2">
                    <Dialog
                      title="Edit membership plan"
                      trigger={<Button variant="secondary">Edit plan</Button>}
                    >
                      <PlanForm plan={p} />
                    </Dialog>
                    <ActionForm
                      action="toggle-plan"
                      submit={p.active ? "Deactivate" : "Activate"}
                      variant="secondary"
                      className=""
                    >
                      <input type="hidden" name="planId" value={p.id} />
                    </ActionForm>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!plans.length && (
        <Card className="p-4 text-sm text-muted-foreground">
          No membership plans.
        </Card>
      )}
    </>
  );
}
