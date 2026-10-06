"use client";
import Link from "next/link";
import { useState } from "react";
import { Filter } from "lucide-react";
import { dayString, parseDay } from "@/lib/domain";
import {
  hasReportDates,
  paymentMethods,
  reportPeriods,
  reportRange,
  reportStatuses,
  type ReportFilters,
} from "@/lib/report-filters";
import { Button } from "./ui/button";
import { Input, NativeSelect } from "./ui/input";

export function ReportFiltersForm({
  filters: f,
  plans,
  today,
}: {
  filters: ReportFilters;
  plans: { id: string; name: string }[];
  today: string;
}) {
  const [period, setPeriod] = useState(f.period);
  const [from, setFrom] = useState(f.from);
  const [to, setTo] = useState(f.to);
  return (
    <form
      action="/reports"
      className="mb-4 rounded-xl border bg-card p-3"
      aria-label="Report filters"
    >
      <input type="hidden" name="type" value={f.type} />
      <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {hasReportDates(f.type) && (
          <>
            <label className="field">
              Period
              <NativeSelect
                name="period"
                value={period}
                onChange={(event) => {
                  const next = event.target.value as ReportFilters["period"];
                  setPeriod(next);
                  if (next !== "custom") {
                    const range = reportRange(next, parseDay(today));
                    setFrom(dayString(range.from));
                    setTo(dayString(range.to));
                  }
                }}
              >
                {Object.entries(reportPeriods)
                  .filter(([key]) => key !== "next-30" || f.type === "renewals")
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </NativeSelect>
            </label>
            <label className="field">
              From date
              <Input
                name="from"
                type="date"
                required
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPeriod("custom");
                }}
              />
            </label>
            <label className="field">
              To date
              <Input
                name="to"
                type="date"
                required
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPeriod("custom");
                }}
              />
            </label>
          </>
        )}
        {f.type === "collections" && (
          <>
            <label className="field">
              Group by
              <NativeSelect name="group" defaultValue={f.group}>
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </NativeSelect>
            </label>
            <label className="field">
              Payment method
              <NativeSelect name="method" defaultValue={f.method}>
                <option value="">All methods</option>
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {method === "BANK"
                      ? "Bank transfer"
                      : method === "CASH"
                        ? "Cash"
                        : method}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </>
        )}
        {f.type === "members" && (
          <label className="field">
            Member status
            <NativeSelect name="status" defaultValue={f.status}>
              {Object.entries(reportStatuses).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {(f.type === "members" || f.type === "renewals") && (
          <label className="field">
            Membership plan
            <NativeSelect name="plan" defaultValue={f.plan}>
              <option value="">All plans</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {f.type === "outstanding" && (
          <label className="field">
            Dues status
            <NativeSelect name="dues" defaultValue={f.dues}>
              <option value="all">All outstanding</option>
              <option value="overdue">Overdue only</option>
              <option value="current">Due today or later</option>
            </NativeSelect>
          </label>
        )}
        {f.type === "renewals" && (
          <label className="field">
            Renewal status
            <NativeSelect name="renewal" defaultValue={f.renewal}>
              <option value="all">All expiring terms</option>
              <option value="needed">Needs renewal</option>
              <option value="booked">Next term booked</option>
            </NativeSelect>
          </label>
        )}
        <label className="field">
          Search members
          <Input
            name="q"
            defaultValue={f.q}
            maxLength={100}
            placeholder="Name, member ID or phone"
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit">
            <Filter />
            Apply filters
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/reports?type=${f.type}`}>Reset</Link>
          </Button>
        </div>
      </div>
      {hasReportDates(f.type) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Dates are inclusive and use IST. Custom ranges can cover up to 366
          days.
        </p>
      )}
    </form>
  );
}
