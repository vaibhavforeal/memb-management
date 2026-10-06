import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { requireConsoleAdmin } from "@/lib/console/guard";
import { auditActions, listAudit } from "@/lib/console/queries";
import { trialDateLabel } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireConsoleAdmin();
  const sp = await searchParams;
  const filters = {
    business: first(sp.business)?.trim() ?? "",
    actor: first(sp.actor)?.trim() ?? "",
    action: first(sp.action) ?? "",
    from: first(sp.from) ?? "",
    to: first(sp.to) ?? "",
  };
  const [{ items, total, page, pages }, actions] = await Promise.all([
    listAudit({ ...filters, page: Number(first(sp.page)) || 1 }),
    auditActions(),
  ]);
  const link = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/audit?${params}`;
  };
  return (
    <>
      <PageHeading title="Audit log" description={`${total} entries`} />
      <form method="get" className="mb-3 flex flex-wrap gap-2">
        <Input
          name="business"
          defaultValue={filters.business}
          placeholder="Workspace id"
          className="max-w-48"
        />
        <Input
          name="actor"
          defaultValue={filters.actor}
          placeholder="Actor email"
          className="max-w-48"
        />
        <NativeSelect
          name="action"
          defaultValue={filters.action}
          className="max-w-64"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </NativeSelect>
        <Input
          name="from"
          type="date"
          defaultValue={filters.from}
          className="max-w-40"
          aria-label="From date"
        />
        <Input
          name="to"
          type="date"
          defaultValue={filters.to}
          className="max-w-40"
          aria-label="To date"
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      <Card>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Workspace</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>{trialDateLabel(a.createdAt)}</td>
                  <td>
                    {a.businessId ? (
                      <Link
                        href={`/workspaces/${a.businessId}`}
                        className="text-primary hover:underline"
                      >
                        {a.businessName}
                      </Link>
                    ) : (
                      "Platform"
                    )}
                  </td>
                  <td>{a.actorEmail}</td>
                  <td>{a.action}</td>
                  <td className="max-w-md truncate" title={a.detail}>
                    {a.detail}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground">
                    No audit entries match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={link(page - 1)}>
                <Button variant="secondary">Previous</Button>
              </Link>
            )}
            {page < pages && (
              <Link href={link(page + 1)}>
                <Button variant="secondary">Next</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
