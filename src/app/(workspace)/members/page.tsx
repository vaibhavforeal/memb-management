import Link from "next/link";
import { Download, Plus, Search, Upload, ArrowRight } from "lucide-react";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { dateLabel, money } from "@/lib/domain";
import {
  directoryQuery,
  getMemberDirectory,
  memberSorts,
  memberStatuses,
  parseDirectoryFilters,
  type DirectoryParams,
  type DirectoryFilters,
} from "@/lib/member-directory";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/avatar";
import { Empty } from "@/components/empty";
import { cn } from "@/lib/utils";

const statusLabels = {
  all: "All",
  active: "Active",
  expiring: "Expiring",
  expired: "Expired",
  unpaid: "Unpaid",
};
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<DirectoryParams>;
}) {
  const ctx = await getContext();
  const filters = parseDirectoryFilters(await searchParams);
  const [{ members, counts, total, page, pages }, plans] = await Promise.all([
    getMemberDirectory(ctx, filters),
    db.plan.findMany({
      where: { businessId: ctx.businessId },
      orderBy: { name: "asc" },
    }),
  ]);
  const href = (changes: Partial<DirectoryFilters> = {}) =>
    `/members?${directoryQuery(filters, { page: 1, ...changes })}`;
  const hasFilters =
    filters.q ||
    filters.plan ||
    filters.fees !== "all" ||
    filters.status !== "all";
  return (
    <>
      <PageHeading
        title="Your members"

        action={
          <div className="flex gap-2">
            {ctx.role === "OWNER" && (
              <Button variant="secondary" asChild>
                <Link href="/members/import">
                  <Upload />
                  Import
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/members/new">
                <Plus />
                Add member
              </Link>
            </Button>
          </div>
        }
      />
      <Card className="min-w-0 overflow-hidden">
        <nav
          aria-label="Member status"
          className="flex gap-1 overflow-x-auto border-b px-3 pt-2"
        >
          {memberStatuses.map((status) => (
            <Link
              key={status}
              href={href({ status })}
              scroll={false}
              aria-current={filters.status === status ? "page" : undefined}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-2 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:min-h-9",
                filters.status === status
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {statusLabels[status]}
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] tabular-nums",
                  filters.status === status ? "bg-primary/10" : "bg-muted",
                )}
              >
                {counts[status]}
              </span>
            </Link>
          ))}
        </nav>
        <form
          action="/members"
          className="flex flex-wrap items-end gap-2 border-b p-3"
          key={directoryQuery(filters)}
        >
          <input type="hidden" name="status" value={filters.status} />
          <label className="field min-w-44 flex-[2]">
            Search members
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                name="q"
                defaultValue={filters.q}
                placeholder="Name, phone or member ID"
                className="pl-9"
              />
            </div>
          </label>
          <label className="field min-w-36 flex-1">
            Plan
            <NativeSelect name="plan" defaultValue={filters.plan}>
              <option value="">All plans</option>
              {filters.plan && !plans.some((p) => p.id === filters.plan) && (
                <option value={filters.plan}>Unavailable plan</option>
              )}
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.active ? "" : " (inactive)"}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="field min-w-32 flex-1">
            Fees
            <NativeSelect name="fees" defaultValue={filters.fees}>
              <option value="all">All balances</option>
              <option value="unpaid">Has unpaid fees</option>
              <option value="settled">No outstanding fees</option>
            </NativeSelect>
          </label>
          <label className="field min-w-40 flex-1">
            Sort by
            <NativeSelect name="sort" defaultValue={filters.sort}>
              {Object.entries(memberSorts).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button variant="secondary">Apply filters</Button>
          {(hasFilters || filters.sort !== "joined-desc") && (
            <Button variant="ghost" asChild>
              <Link href="/members">Reset</Link>
            </Button>
          )}
        </form>
        <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2 text-[11px] text-muted-foreground">
          {ctx.role === "OWNER" && (
            <Button asChild variant="ghost" size="sm">
              <a
                href={`/api/members/export?scope=filtered&${directoryQuery(filters, { page: 1 })}`}
              >
                <Download />
                Export CSV
              </a>
            </Button>
          )}
        </div>
        {members.length ? (
          <div className="table-wrap">
            <table className="data-table" aria-label="Members">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Mobile number</th>
                  <th>Membership</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Outstanding</th>
                  <th className="relative">
                    <span className="sr-only">View member</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link
                        href={`/members/${m.id}`}
                        className="flex items-center gap-2.5"
                      >
                        <Avatar name={m.name} small />
                        <span>
                          <span className="block font-medium">{m.name}</span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {m.code}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="text-muted-foreground">{m.phone}</td>
                    <td>
                      <span className="block text-xs">
                        {m.planName ?? "No membership"}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {m.endDate
                          ? `Until ${dateLabel(m.endDate)}`
                          : "Assign a plan to get started"}
                      </span>
                    </td>
                    <td>
                      <Badge>{m.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {dateLabel(m.createdAt)}
                    </td>
                    <td
                      className={
                        m.outstanding > 0
                          ? "text-amber-800"
                          : "text-muted-foreground"
                      }
                    >
                      {money(Number(m.outstanding))}
                    </td>
                    <td>
                      <Link
                        href={`/members/${m.id}`}
                        aria-label={`View ${m.name}`}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={hasFilters ? "No matching members" : "Build your community"}
            description={
              hasFilters
                ? "Try another search, plan, or fee filter."
                : "Add your first member, or import your existing member list."
            }
          >
            <Button asChild>
              <Link href={hasFilters ? "/members" : "/members/new"}>
                {hasFilters ? "Clear filters" : "Add member"}
              </Link>
            </Button>
          </Empty>
        )}
        <div className="flex items-center justify-between gap-2 border-t p-3 text-[11px] text-muted-foreground">
          <span>
            {total} members · Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild size="sm" variant="secondary">
                <Link href={href({ page: page - 1 })} scroll={false}>
                  Previous
                </Link>
              </Button>
            )}
            {page < pages && (
              <Button asChild size="sm" variant="secondary">
                <Link href={href({ page: page + 1 })} scroll={false}>
                  Next
                </Link>
              </Button>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
