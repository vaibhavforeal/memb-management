import Link from "next/link";
import {
  BarChart3,
  CalendarClock,
  CalendarCheck,
  Download,
  Users,
  Wallet,
} from "lucide-react";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { dateLabel, dayString, money, todayIST } from "@/lib/domain";
import {
  hasReportDates,
  parseReportFilters,
  ReportFilterError,
  reportQuery,
  reportTypes,
  type ReportFilters,
  type ReportParams,
} from "@/lib/report-filters";
import { getReport, reportCell } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/page-heading";
import { ReportFiltersForm } from "@/components/report-filters";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";

const icons = {
  members: Users,
  collections: BarChart3,
  outstanding: Wallet,
  renewals: CalendarClock,
  attendance: CalendarCheck,
};
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportParams>;
}) {
  const ctx = await getContext(),
    params = await searchParams,
    today = todayIST();
  let filters: ReportFilters, error: string | undefined;
  try {
    filters = parseReportFilters(params, today);
  } catch (cause) {
    if (!(cause instanceof ReportFilterError)) throw cause;
    error = cause.message;
    filters = parseReportFilters({ ...params, period: undefined }, today);
    filters.period = "custom";
    filters.from = typeof params.from === "string" ? params.from : "";
    filters.to = typeof params.to === "string" ? params.to : "";
  }
  const [report, plans] = await Promise.all([
    error ? Promise.resolve(null) : getReport(ctx, filters),
    filters.type === "members" || filters.type === "renewals"
      ? db.plan.findMany({
          where: { businessId: ctx.businessId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const query = reportQuery(filters, { page: 1 });
  return (
    <>
      <PageHeading
        title="Reports"
        description="Membership, collections and follow-ups in one place."
        action={
          ctx.role === "OWNER" && report ? (
            <Button asChild variant="secondary">
              <a href={`/api/reports/export?${query}`}>
                <Download />
                Export CSV
              </a>
            </Button>
          ) : undefined
        }
      />
      <nav
        aria-label="Report types"
        className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5"
      >
        {Object.entries(reportTypes).map(([type, label]) => {
          const Icon = icons[type as keyof typeof icons];
          return (
            <Link
              key={type}
              href={`/reports?type=${type}`}
              aria-current={filters.type === type ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-3 text-xs font-medium transition-colors",
                filters.type === type
                  ? "border-primary/35 bg-primary/10 text-primary"
                  : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>
      <ReportFiltersForm
        key={reportQuery(filters)}
        filters={filters}
        plans={plans}
        today={dayString(today)}
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {report && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>
              {hasReportDates(filters.type)
                ? `${dateLabel(filters.from)} – ${dateLabel(filters.to)} · IST`
                : `Current position · ${dateLabel(report.today)} · IST`}
            </p>
            <p>
              Totals cover all matching results
              {ctx.role !== "OWNER"
                ? " · CSV export is available to owners"
                : ""}
            </p>
          </div>
          <div
            className={cn(
              "mb-4 grid grid-cols-2 gap-3",
              report.metrics.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4",
            )}
          >
            {report.metrics.map((metric) => (
              <Card key={metric.label} className="min-w-0 p-3">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="stat-number mt-2 break-words">
                  {metric.money
                    ? money(metric.value)
                    : metric.value.toLocaleString("en-IN")}
                </p>
              </Card>
            ))}
          </div>
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="flex-wrap">
              <CardTitle>{reportTypes[filters.type]}</CardTitle>
              <span className="text-xs text-muted-foreground">
                {report.total.toLocaleString("en-IN")}{" "}
                {filters.type === "collections" ? "periods" : "rows"}
              </span>
            </CardHeader>
            <p className="border-t px-3 py-3 text-xs leading-relaxed text-muted-foreground">
              {report.note}
            </p>
            {report.rows.length ? (
              <div
                className="table-wrap"
                role="region"
                aria-label={`${reportTypes[filters.type]} table`}
                tabIndex={0}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      {report.columns.map((column) => (
                        <th
                          key={column.key}
                          scope="col"
                          className={
                            column.kind === "money" || column.kind === "number"
                              ? "text-right"
                              : undefined
                          }
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.id}>
                        {report.columns.map((column) => (
                          <td
                            key={column.key}
                            className={cn(
                              (column.kind === "money" ||
                                column.kind === "number") &&
                                "text-right tabular-nums",
                              (column.key === "net" ||
                                column.key === "outstanding") &&
                                "font-medium text-primary",
                            )}
                          >
                            {column.key === "name" && row.memberId ? (
                              <Link
                                href={`/members/${row.memberId}${filters.type === "outstanding" ? "?tab=payments" : ""}`}
                                className="font-medium hover:text-primary hover:underline"
                              >
                                {reportCell(row, column)}
                              </Link>
                            ) : (
                              reportCell(row, column)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No matching results"
                description="Try another date range or clear your filters. New records will appear here as they are added."
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground">
              <span>
                {report.total
                  ? `Showing ${(report.page - 1) * 25 + 1}–${Math.min(report.page * 25, report.total)} of ${report.total}`
                  : "0 results"}
                {report.pages > 1
                  ? ` · Page ${report.page} of ${report.pages}`
                  : ""}
              </span>
              <div className="flex gap-2">
                {report.page > 1 && (
                  <Button asChild variant="secondary" size="sm">
                    <Link
                      href={`/reports?${reportQuery(filters, { page: report.page - 1 })}`}
                    >
                      Previous
                    </Link>
                  </Button>
                )}
                {report.page < report.pages && (
                  <Button asChild variant="secondary" size="sm">
                    <Link
                      href={`/reports?${reportQuery(filters, { page: report.page + 1 })}`}
                    >
                      Next
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </Card>
          {ctx.role === "OWNER" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Export CSV downloads every matching row, including results on
              other pages. Amounts are in INR.
            </p>
          )}
        </>
      )}
    </>
  );
}
