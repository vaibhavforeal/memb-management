import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireConsoleAdmin } from "@/lib/console/guard";
import { listUsers } from "@/lib/console/queries";
import { dateLabel } from "@/lib/domain";

export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireConsoleAdmin();
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? "";
  const { items, total, page, pages } = await listUsers({
    q,
    page: Number(first(sp.page)) || 1,
  });
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/users?${params}`;
  };
  return (
    <>
      <PageHeading title="Users" description={`${total} matching`} />
      <form method="get" className="mb-3 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          className="max-w-xs"
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
                <th>Name</th>
                <th>Email</th>
                <th>Platform admin</th>
                <th>Workspaces</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link
                      href={`/users/${u.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {u.name}
                    </Link>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.platformAdmin ? <Badge>Admin</Badge> : "—"}</td>
                  <td>{u._count.access}</td>
                  <td>{dateLabel(u.createdAt)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground">
                    No users match.
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
