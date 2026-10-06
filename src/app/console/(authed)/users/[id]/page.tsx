import Link from "next/link";
import { notFound } from "next/navigation";
import { consoleAction } from "@/app/console/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireConsoleAdmin } from "@/lib/console/guard";
import { userDetail } from "@/lib/console/queries";
import { dateLabel } from "@/lib/domain";
import { trialDateLabel } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireConsoleAdmin();
  const { id } = await params;
  const user = await userDetail(id);
  if (!user) notFound();
  const isSelf = user.id === admin.id;
  const hidden = <input type="hidden" name="userId" value={user.id} />;
  const send = { serverAction: consoleAction, className: "" } as const;
  return (
    <>
      <PageHeading
        title={user.name}
        description={`${user.email} · joined ${dateLabel(user.createdAt)}`}
        action={user.platformAdmin ? <Badge>Platform admin</Badge> : undefined}
      />
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-start gap-3">
            {!user.platformAdmin && (
              <ActionForm
                action="console-admin"
                submit="Grant admin"
                variant="secondary"
                {...send}
              >
                {hidden}
                <input type="hidden" name="grant" value="true" />
              </ActionForm>
            )}
            {user.platformAdmin && !isSelf && (
              <ActionForm
                action="console-admin"
                submit="Revoke admin"
                variant="secondary"
                {...send}
              >
                {hidden}
                <input type="hidden" name="grant" value="false" />
              </ActionForm>
            )}
            <ActionForm
              action="console-signout-user"
              submit="Force sign-out"
              variant="secondary"
              {...send}
            >
              {hidden}
            </ActionForm>
          </div>
          {isSelf && (
            <p className="mt-2 text-xs text-muted-foreground">
              This is your own account. Forcing sign-out ends this console
              session.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
        </CardHeader>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {user.access.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link
                      href={`/workspaces/${a.business.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {a.business.name}
                    </Link>
                  </td>
                  <td>{a.role}</td>
                </tr>
              ))}
              {user.access.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-muted-foreground">
                    No workspaces.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
        </CardHeader>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Last updated</th>
                <th>IP address</th>
                <th>User agent</th>
              </tr>
            </thead>
            <tbody>
              {user.sessions.map((s) => (
                <tr key={s.id}>
                  <td>{trialDateLabel(s.createdAt)}</td>
                  <td>{trialDateLabel(s.updatedAt)}</td>
                  <td>{s.ipAddress ?? "—"}</td>
                  <td
                    className="max-w-xs truncate"
                    title={s.userAgent ?? undefined}
                  >
                    {s.userAgent ? s.userAgent.slice(0, 80) : "—"}
                  </td>
                </tr>
              ))}
              {user.sessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground">
                    No active sessions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
