import { Wordmark } from "@/components/wordmark";
import { Building2, Plus, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/context";
import { db } from "@/lib/db";
import { dateLabel, money, todayIST } from "@/lib/domain";
import { razorpayAvailable } from "@/lib/razorpay";
import { ActionForm } from "@/components/action-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SignoutButton } from "@/components/signout-button";
import { manualWhatsApp } from "@/lib/whatsapp-mode";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const admin = await requireAdmin();
  const manual = manualWhatsApp();
  const [businesses, worker, backups] = await Promise.all([
    db.business.findMany({
      include: {
        access: {
          where: { userId: admin.id, role: "OWNER" },
          select: { id: true },
        },
        _count: {
          select: { members: true, messages: true, manualSends: true },
        },
        connection: {
          select: { status: true, checkedAt: true, lastError: true },
        },
        invitations: { where: { acceptedAt: null }, select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.workerHeartbeat.findUnique({ where: { id: "worker" } }),
    db.workerHeartbeat.findUnique({ where: { id: "backup" } }),
  ]);
  const workerUp = worker && worker.updatedAt > new Date(Date.now() - 180000);
  return (
    <main className="mx-auto max-w-[1500px] p-3 sm:p-4 lg:p-5">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          <Wordmark />
          <span className="ml-3 rounded-md border px-2 py-1 text-[10px] font-normal text-muted-foreground">
            Platform admin
          </span>
        </span>
        <SignoutButton />
      </header>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-heading">Workspaces</h1>
        </div>
        <Dialog
          title="Create a business workspace"
          trigger={
            <Button>
              <Plus />
              New business
            </Button>
          }
        >
          <ActionForm action="admin-create" submit="Create workspace">
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
      </div>
      {!razorpayAvailable() && (
        <p className="mb-4 rounded-lg border p-3 text-sm text-muted-foreground">
          Razorpay payments need RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and
          RAZORPAY_WEBHOOK_SECRET on the server. You can configure business fees
          now.
        </p>
      )}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Businesses</p>
          <p className="stat-number mt-3">{businesses.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">
            {manual ? "WhatsApp sending" : "Reminder worker"}
          </p>
          <div className="mt-3">
            <Badge>
              {manual ? "Manual" : workerUp ? "Active" : "Needs attention"}
            </Badge>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {manual
              ? "Messages are sent by each user in WhatsApp. No messaging worker is required."
              : (worker?.detail ??
                "Start the worker process to schedule messages.")}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">
            Last successful backup
          </p>
          <p className="mt-3 text-sm">
            {backups ? dateLabel(backups.updatedAt) : "Not configured"}
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Configure encrypted off-site backups before launch.
          </p>
        </Card>
      </div>
      <div className="space-y-3">
        {businesses.map((b) => (
          <Card key={b.id}>
            <CardHeader>
              <div>
                <CardTitle>{b.name}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {b.city} · {b._count.members} members ·{" "}
                  {manual ? b._count.manualSends : b._count.messages} messages
                  recorded
                </p>
              </div>
              <Badge>{b.status}</Badge>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span>
                  WhatsApp:{" "}
                  {manual
                    ? "Manual sending"
                    : (b.connection?.status ?? "DISCONNECTED")}
                </span>
                {!manual && b.connection?.lastError && (
                  <span className="text-destructive">
                    {b.connection.lastError}
                  </span>
                )}
                <span>Pending invitations: {b.invitations.length}</span>
                <span>
                  Monthly fee:{" "}
                  {b.monthlyFeePaise === null
                    ? "Not configured"
                    : money(b.monthlyFeePaise)}
                </span>
                <span>
                  Billing:{" "}
                  {b.monthlyFeePaise === null
                    ? "Disabled"
                    : b.billingPaidThrough && b.billingPaidThrough >= todayIST()
                      ? `Paid through ${dateLabel(b.billingPaidThrough)}`
                      : "Payment due"}
                </span>
              </div>
              <div className="flex flex-wrap items-start gap-3">
                {b.access.length > 0 && (
                  <ActionForm
                    action="admin-open"
                    submit="Open workspace"
                    className=""
                  >
                    <input type="hidden" name="businessId" value={b.id} />
                  </ActionForm>
                )}
                <Dialog
                  title="Configure monthly business fee"
                  description="The owner pays for each monthly renewal. Fee changes apply to new checkout orders; existing orders retain their quoted amount."
                  trigger={
                    <Button variant="secondary">Configure billing</Button>
                  }
                >
                  <ActionForm action="admin-billing" submit="Save monthly fee">
                    <input type="hidden" name="businessId" value={b.id} />
                    <label className="field">
                      Monthly fee (₹)
                      <Input
                        name="monthlyFee"
                        type="number"
                        min="1"
                        max="9999999.99"
                        step="0.01"
                        defaultValue={
                          b.monthlyFeePaise === null
                            ? ""
                            : b.monthlyFeePaise / 100
                        }
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Leave blank to disable monthly billing. Enter the full
                      amount to collect, including any applicable taxes.
                    </p>
                  </ActionForm>
                </Dialog>
                <ActionForm
                  action="admin-status"
                  submit={
                    b.status === "ACTIVE"
                      ? "Suspend workspace"
                      : "Reactivate workspace"
                  }
                  variant="secondary"
                  className=""
                >
                  <input type="hidden" name="businessId" value={b.id} />
                </ActionForm>
                {b.invitations.length > 0 && (
                  <ActionForm
                    action="admin-resend"
                    submit="Resend owner invitation"
                    variant="secondary"
                    className=""
                  >
                    <input type="hidden" name="businessId" value={b.id} />
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
                    action="admin-support"
                    submit="Start support session"
                  >
                    <input type="hidden" name="businessId" value={b.id} />
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
        ))}
      </div>
    </main>
  );
}
