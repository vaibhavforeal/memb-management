import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { consoleAction } from "@/app/console/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { requireConsoleAdmin } from "@/lib/console/guard";
import { STATE_LABELS, workspaceDetail } from "@/lib/console/queries";
import { db } from "@/lib/db";
import { dateLabel, money } from "@/lib/domain";
import { trialDateLabel } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireConsoleAdmin();
  const { id } = await params;
  const detail = await workspaceDetail(id);
  if (!detail) notFound();
  const { business: b, state, grants, audit } = detail;
  const ownerAccess = await db.staffAccess.findFirst({
    where: { businessId: id, userId: admin.id, role: "OWNER" },
    select: { id: true },
  });
  const mainUrl = process.env.BETTER_AUTH_URL;
  const pending = b.invitations.length > 0;
  const hidden = <input type="hidden" name="businessId" value={b.id} />;
  const send = { serverAction: consoleAction, className: "" } as const;
  return (
    <>
      <PageHeading
        title={b.name}
        description={`${b.city} · created ${dateLabel(b.createdAt)} · ${b._count.members} members`}
        action={<Badge>{STATE_LABELS[state]}</Badge>}
      />
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-start gap-3">
            {ownerAccess && mainUrl && (
              <Button asChild>
                <a href={`${mainUrl}/open/${b.id}`}>Open workspace</a>
              </Button>
            )}
            <Dialog
              title="Configure monthly business fee"
              description="The owner pays for each monthly renewal. Fee changes apply to new checkout orders; existing orders retain their quoted amount."
              trigger={<Button variant="secondary">Configure billing</Button>}
            >
              <ActionForm
                action="console-fee"
                serverAction={consoleAction}
                submit="Save monthly fee"
              >
                {hidden}
                <label className="field">
                  Monthly fee (₹)
                  <Input
                    name="monthlyFee"
                    type="number"
                    min="1"
                    max="9999999.99"
                    step="0.01"
                    defaultValue={
                      b.monthlyFeePaise === null ? "" : b.monthlyFeePaise / 100
                    }
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Leave blank to disable monthly billing. Enter the full amount
                  to collect, including any applicable taxes.
                </p>
              </ActionForm>
            </Dialog>
            <Dialog
              title="Extend trial"
              description="New trial end = later of now and the current trial end, plus the days entered."
              trigger={<Button variant="secondary">Extend trial</Button>}
            >
              <ActionForm
                action="console-extend-trial"
                serverAction={consoleAction}
                submit="Extend trial"
              >
                {hidden}
                <label className="field">
                  Days (1–90)
                  <Input
                    required
                    name="days"
                    type="number"
                    min="1"
                    max="90"
                    step="1"
                  />
                </label>
              </ActionForm>
            </Dialog>
            <Dialog
              title="Mark paid through a date"
              description="Records an offline payment. The note is stored in the audit log."
              trigger={<Button variant="secondary">Mark paid</Button>}
            >
              <ActionForm
                action="console-mark-paid"
                serverAction={consoleAction}
                submit="Save paid-through date"
              >
                {hidden}
                <label className="field">
                  Paid through
                  <Input required name="paidThrough" type="date" />
                </label>
                <label className="field">
                  Note
                  <Input
                    required
                    minLength={10}
                    maxLength={500}
                    name="note"
                    placeholder="e.g. Bank transfer received 5 Oct, ref 12345"
                  />
                </label>
              </ActionForm>
            </Dialog>
            <ActionForm
              action="console-status"
              submit={
                b.status === "ACTIVE"
                  ? "Suspend workspace"
                  : "Reactivate workspace"
              }
              variant="secondary"
              {...send}
            >
              {hidden}
            </ActionForm>
            {pending && (
              <ActionForm
                action="console-resend"
                submit="Resend owner invitation"
                variant="secondary"
                {...send}
              >
                {hidden}
              </ActionForm>
            )}
            <Dialog
              title="Start audited support access"
              description="This grants owner-level access for 30 minutes. Your reason and subsequent changes will be recorded."
              trigger={
                <Button variant="secondary">
                  <ShieldCheck />
                  Support access
                </Button>
              }
            >
              <ActionForm
                action="console-support"
                serverAction={consoleAction}
                submit="Start support session"
              >
                {hidden}
                <label className="field">
                  Reason for access
                  <Input
                    required
                    minLength={10}
                    maxLength={500}
                    name="reason"
                    placeholder="e.g. Owner requested help with a member import"
                  />
                </label>
              </ActionForm>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">State</dt>
              <dd>{STATE_LABELS[state]}</dd>
              <dt className="text-muted-foreground">Monthly fee</dt>
              <dd>
                {b.monthlyFeePaise === null
                  ? "Not configured"
                  : money(b.monthlyFeePaise)}
              </dd>
              <dt className="text-muted-foreground">Paid through</dt>
              <dd>
                {b.billingPaidThrough ? dateLabel(b.billingPaidThrough) : "—"}
              </dd>
              <dt className="text-muted-foreground">Trial ends</dt>
              <dd>{b.trialEndsAt ? trialDateLabel(b.trialEndsAt) : "—"}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            {pending ? (
              <ul className="space-y-1 text-sm">
                {b.invitations.map((i) => (
                  <li key={i.id}>
                    {i.email} · {i.role} · expires {dateLabel(i.expiresAt)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Owners and staff</CardTitle>
        </CardHeader>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {b.access.map((a) => (
                <tr key={a.id}>
                  <td>{a.user.email}</td>
                  <td>{a.user.name}</td>
                  <td>{a.role}</td>
                  <td>{dateLabel(a.user.createdAt)}</td>
                </tr>
              ))}
              {b.access.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground">
                    No staff yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Recent billing orders</CardTitle>
        </CardHeader>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Amount</th>
                <th>Period</th>
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {b.billingOrders.map((o) => (
                <tr key={o.id}>
                  <td>{dateLabel(o.createdAt)}</td>
                  <td>{money(o.amountPaise)}</td>
                  <td>
                    {o.periodStart && o.periodEnd
                      ? `${dateLabel(o.periodStart)} – ${dateLabel(o.periodEnd)}`
                      : "—"}
                  </td>
                  <td>{o.paidAt ? dateLabel(o.paidAt) : "Unpaid"}</td>
                </tr>
              ))}
              {b.billingOrders.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground">
                    No billing orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Support sessions</CardTitle>
        </CardHeader>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Reason</th>
                <th>Created</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id}>
                  <td>{g.actorEmail}</td>
                  <td>{g.reason}</td>
                  <td>{trialDateLabel(g.createdAt)}</td>
                  <td>{trialDateLabel(g.expiresAt)}</td>
                </tr>
              ))}
              {grants.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground">
                    No support sessions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <Link
            href={`/audit?business=${b.id}`}
            className="text-xs text-primary hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>{trialDateLabel(a.createdAt)}</td>
                  <td>{a.actorEmail}</td>
                  <td>{a.action}</td>
                  <td className="max-w-md truncate" title={a.detail}>
                    {a.detail}
                  </td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground">
                    No audit entries.
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
