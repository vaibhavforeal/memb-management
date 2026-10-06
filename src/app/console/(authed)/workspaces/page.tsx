import Link from "next/link";
import { Plus } from "lucide-react";
import { consoleAction } from "@/app/console/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { requireConsoleAdmin } from "@/lib/console/guard";
import {
  listWorkspaces,
  STATE_LABELS,
  WORKSPACE_STATES,
} from "@/lib/console/queries";
import { dateLabel, money } from "@/lib/domain";

export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireConsoleAdmin();
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? "";
  const state = first(sp.state) ?? "";
  const { items, total, page, pages } = await listWorkspaces({
    q,
    state,
    page: Number(first(sp.page)) || 1,
  });
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (state) params.set("state", state);
    params.set("page", String(p));
    return `/workspaces?${params}`;
  };
  return (
    <>
      <PageHeading
        title="Workspaces"
        description={`${total} matching`}
        action={
          <Dialog
            title="Create a business workspace"
            trigger={
              <Button>
                <Plus />
                New business
              </Button>
            }
          >
            <ActionForm
              action="console-create"
              serverAction={consoleAction}
              submit="Create workspace"
            >
              <label className="field">
                Business name
                <Input required minLength={2} maxLength={100} name="name" />
              </label>
              <label className="field">
                City
                <Input required minLength={2} maxLength={100} name="city" />
              </label>
            </ActionForm>
          </Dialog>
        }
      />
      <form method="get" className="mb-3 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search name, city or owner email"
          className="max-w-xs"
        />
        <NativeSelect name="state" defaultValue={state} className="max-w-48">
          <option value="">All states</option>
          {WORKSPACE_STATES.map((s) => (
            <option key={s} value={s}>
              {STATE_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      <Card>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>City</th>
                <th>Owner</th>
                <th>State</th>
                <th>Members</th>
                <th>Monthly fee</th>
                <th>Paid through / trial ends</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link
                      href={`/workspaces/${b.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {b.name}
                    </Link>
                  </td>
                  <td>{b.city}</td>
                  <td>
                    {b.access.map((a) => a.user.email).join(", ") ||
                      (b.invitations.length
                        ? `${b.invitations[0].email} (invited)`
                        : "—")}
                  </td>
                  <td>
                    <Badge>{STATE_LABELS[b.state]}</Badge>
                  </td>
                  <td>{b._count.members}</td>
                  <td>
                    {b.monthlyFeePaise === null
                      ? "—"
                      : money(b.monthlyFeePaise)}
                  </td>
                  <td>
                    {b.billingPaidThrough
                      ? `Paid ${dateLabel(b.billingPaidThrough)}`
                      : b.trialEndsAt
                        ? `Trial ${dateLabel(b.trialEndsAt)}`
                        : "—"}
                  </td>
                  <td>{dateLabel(b.createdAt)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-muted-foreground">
                    No workspaces match.
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
              <Button asChild variant="secondary">
                <Link href={link(page - 1)}>Previous</Link>
              </Button>
            )}
            {page < pages && (
              <Button asChild variant="secondary">
                <Link href={link(page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
