import {
  MessageCircle,
  Settings2,
  Users,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { getContext, ownerOnly } from "@/lib/context";
import { db } from "@/lib/db";
import { dateLabel } from "@/lib/domain";
import { PageHeading } from "@/components/page-heading";
import { ActionForm } from "@/components/action-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/avatar";
import Link from "next/link";
import { manualWhatsApp } from "@/lib/whatsapp-mode";
import { BusinessLogoForm } from "@/components/business-logo-form";
import { businessLogoUrl } from "@/lib/business-logo-utils";
export default async function SettingsPage() {
  const ctx = await getContext();
  ownerOnly(ctx);
  const manual = manualWhatsApp();
  const b = await db.business.findUniqueOrThrow({
    where: { id: ctx.businessId },
    include: {
      logo: { select: { version: true } },
      connection: true,
      templates: { orderBy: { name: "asc" } },
      access: { include: { user: true } },
      invitations: {
        where: { acceptedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      audit: { orderBy: { createdAt: "desc" }, take: 15 },
    },
  });
  return (
    <>
      <PageHeading title="Settings" />
      <div className="grid items-start gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <Settings2 className="mr-2 inline size-4 text-muted-foreground" />
              {manual ? "Business details" : "Business & reminders"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BusinessLogoForm
              name={b.name}
              logoUrl={businessLogoUrl(b.logo?.version)}
            />
            <ActionForm action="settings">
              <div className="form-grid">
                <label className="field">
                  Business name
                  <Input
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    defaultValue={b.name}
                  />
                </label>
                <label className="field">
                  City
                  <Input name="city" required defaultValue={b.city} />
                </label>
                <label className="field">
                  Business phone
                  <Input
                    name="phone"
                    type="tel"
                    maxLength={40}
                    defaultValue={b.phone}
                  />
                </label>
                <label className="field sm:col-span-2">
                  Business address
                  <Textarea
                    name="address"
                    maxLength={500}
                    defaultValue={b.address}
                    aria-describedby="business-address-help"
                  />
                </label>
                <p
                  id="business-address-help"
                  className="text-xs text-muted-foreground sm:col-span-2"
                >
                  Business contact details are shown on bills and membership
                  cards.
                </p>
              </div>
              {!manual && (
                <>
                  <div className="border-t pt-3">
                    <label className="flex items-center gap-3 text-sm">
                      <input
                        name="remindersEnabled"
                        type="checkbox"
                        defaultChecked={b.remindersEnabled}
                      />
                      Enable automated reminders
                    </label>
                  </div>
                  <label className="field">
                    Renewal reminders · days before expiry
                    <Input
                      name="renewalOffsets"
                      defaultValue={b.renewalOffsets.join(", ")}
                      placeholder="7, 3, 0"
                    />
                  </label>
                  <label className="field">
                    Fee reminders · days after due date
                    <Input
                      name="duesOffsets"
                      defaultValue={b.duesOffsets.join(", ")}
                      placeholder="1, 7"
                    />
                  </label>
                  <label className="field">
                    Send time (IST)
                    <NativeSelect
                      name="reminderHour"
                      defaultValue={b.reminderHour}
                    >
                      {Array.from({ length: 13 }, (_, i) => i + 8).map((h) => (
                        <option value={h} key={h}>
                          {h}:00 IST
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Comma-separated days. Leave blank to disable.
                  </p>
                </>
              )}
            </ActionForm>
          </CardContent>
        </Card>
        {manual ? (
          <Card id="whatsapp">
            <CardHeader>
              <CardTitle>
                <MessageCircle className="mr-2 inline size-4 text-primary" />
                WhatsApp
              </CardTitle>
              <Badge>Manual sending</Badge>
            </CardHeader>
            <CardContent>
              <Link
                className="mt-3 inline-block text-sm text-primary"
                href="/whatsapp"
              >
                Open WhatsApp follow-ups ↗
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card id="whatsapp">
            <CardHeader>
              <CardTitle>
                <MessageCircle className="mr-2 inline size-4 text-primary" />
                WhatsApp Business
              </CardTitle>
              <Badge>{b.connection?.status ?? "DISCONNECTED"}</Badge>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">
                Connect your Meta WhatsApp Business account.
              </p>
              {b.connection?.displayPhone && (
                <p className="mb-3 text-xs">
                  Sender: {b.connection.displayPhone}
                </p>
              )}
              {b.connection?.lastError && (
                <p className="mb-3 text-xs text-destructive">
                  {b.connection.lastError}
                </p>
              )}
              <ActionForm action="connect-whatsapp" submit="Verify & connect">
                <label className="field">
                  WhatsApp Business Account ID
                  <Input
                    name="accountId"
                    required
                    placeholder="From Meta Business settings"
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  Phone number ID
                  <Input
                    name="phoneNumberId"
                    required
                    placeholder="From WhatsApp API setup"
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  Access token
                  <Input
                    name="token"
                    type="password"
                    required
                    minLength={20}
                    autoComplete="new-password"
                    placeholder="Paste a token with the required permissions"
                  />
                </label>
              </ActionForm>
              {b.connection && (
                <div className="mt-3 flex flex-wrap items-start gap-3 border-t pt-3">
                  <ActionForm
                    action="sync-templates"
                    submit="Sync templates"
                    variant="secondary"
                    className=""
                  />
                  <ActionForm
                    action="disconnect-whatsapp"
                    submit="Disconnect"
                    variant="destructive"
                    className=""
                  />
                </div>
              )}
              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                Monthly message limit: {b.messageLimit.toLocaleString("en-IN")}.
                Messaging fees are separate from your membership records.
              </p>
            </CardContent>
          </Card>
        )}
        {!manual && (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Templates & field mapping</CardTitle>
              <span className="text-[11px] text-muted-foreground">
                Approval comes from Meta
              </span>
            </CardHeader>
            <CardContent>
              {b.templates.length ? (
                <div className="grid gap-3 xl:grid-cols-3">
                  {b.templates.map((t) => (
                    <div key={t.id} className="rounded-lg border p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="break-all text-xs font-medium">
                          {t.name}
                        </h3>
                        <Badge>{t.status}</Badge>
                      </div>
                      <p className="mb-3 text-[10px] text-muted-foreground">
                        {t.category} · {t.language}
                        {!t.providerId && " · Demo template"}
                      </p>
                      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                        {t.body}
                      </p>
                      <ActionForm
                        action="map-template"
                        submit="Save mapping"
                        variant="secondary"
                      >
                        <input type="hidden" name="templateId" value={t.id} />
                        <label className="field">
                          Use for
                          <NativeSelect name="purpose" defaultValue={t.purpose}>
                            <option value="ANNOUNCEMENT">Announcements</option>
                            <option value="RENEWAL">Renewal reminders</option>
                            <option value="DUES">Fee reminders</option>
                          </NativeSelect>
                        </label>
                        <label className="field">
                          Fields in placeholder order
                          <Input
                            name="keys"
                            defaultValue={t.parameterKeys.join(", ")}
                            placeholder="name, business, expiry"
                          />
                        </label>
                      </ActionForm>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Connect your account, then sync its approved templates.
                </p>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Fields: name, business, expiry, amount, due, date.
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>
              <Users className="mr-2 inline size-4 text-muted-foreground" />
              Your team
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 divide-y">
              {b.access.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={a.user.name} />
                    <span>
                      <span className="block text-xs font-medium">
                        {a.user.name}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {a.user.email} · {a.role.toLowerCase()}
                      </span>
                    </span>
                  </div>
                  {a.userId !== ctx.userId && (
                    <ActionForm
                      action="remove-staff"
                      submit="Remove access"
                      variant="secondary"
                      className=""
                    >
                      <input type="hidden" name="accessId" value={a.id} />
                    </ActionForm>
                  )}
                </div>
              ))}
            </div>
            <h3 className="mb-3 text-sm font-medium">Invite a teammate</h3>
            <ActionForm action="invite" submit="Send invitation">
              <div className="form-grid">
                <label className="field">
                  Name
                  <Input name="name" required />
                </label>
                <label className="field">
                  Email
                  <Input name="email" type="email" required />
                </label>
              </div>
              <label className="field">
                Role
                <NativeSelect name="role">
                  <option value="STAFF">
                    Staff · members, payments, attendance
                  </option>
                  <option value="OWNER">Owner · full business access</option>
                </NativeSelect>
              </label>
            </ActionForm>
            {b.invitations.length > 0 && (
              <div className="mt-3 space-y-2 border-t pt-4">
                <p className="text-xs font-medium">Pending invitations</p>
                {b.invitations.map((i) => (
                  <p key={i.id} className="text-[11px] text-muted-foreground">
                    {i.email} ·{" "}
                    {i.expiresAt < new Date()
                      ? "Expired"
                      : `Expires ${dateLabel(i.expiresAt)}`}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <ShieldCheck className="mr-2 inline size-4 text-muted-foreground" />
              Activity log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {b.audit.map((a) => (
                <div key={a.id} className="border-b pb-3 last:border-b-0">
                  <p className="text-[11px] font-medium">
                    {a.action.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {a.detail}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {dateLabel(a.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>{" "}
    </>
  );
}
