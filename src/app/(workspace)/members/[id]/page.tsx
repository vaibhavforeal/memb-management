import Link from "next/link";
import {
  Check,
  ChevronLeft,
  Pencil,
  Phone,
  Mail,
  MessageCircle,
} from "lucide-react";
import { manualWhatsApp } from "@/lib/whatsapp-mode";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { memberFor } from "@/lib/services";
import {
  balance,
  dateLabel,
  dayString,
  membershipStatus,
  money,
  renewalStart,
  todayIST,
} from "@/lib/domain";
import { ActionForm } from "@/components/action-form";
import { MemberForm } from "@/components/member-form";
import { MembershipForm } from "@/components/membership-form";
import { MemberTabs } from "@/components/member-tabs";
import { MemberQrButton } from "@/components/member-qr-button";
import { MemberPayments } from "@/components/member-payments";
import { Avatar } from "@/components/avatar";
import { memberPhotoUrl } from "@/lib/member-photo-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";

export default async function MemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getContext(),
    { id } = await params;
  const manual = manualWhatsApp();
  const [m, plans, history] = await Promise.all([
    memberFor(ctx, id),
    db.plan.findMany({
      where: { businessId: ctx.businessId, active: true },
      orderBy: { months: "asc" },
    }),
    manual
      ? db.manualSend.findMany({
          where: { businessId: ctx.businessId, memberId: id },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);
  const terms = m.memberships;
  const latest = terms.find((t) => !t.cancelledAt);
  const totalDue = terms.reduce(
    (sum, term) => sum + (term.charge ? balance(term.charge) : 0),
    0,
  );
  return (
    <>
      <Link
        href="/members"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground"
      >
        <ChevronLeft size={14} />
        All members
      </Link>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {m.photo ? (
            <img
              src={memberPhotoUrl(m.id, m.photo.version)!}
              alt={`Photo of ${m.name}`}
              width={40}
              height={40}
              className="size-10 rounded-full object-cover"
            />
          ) : (
            <Avatar name={m.name} />
          )}
          <div>
            <h1 className="page-heading">{m.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{m.code}</span>
              <Badge>{m.archived ? "Archived" : membershipStatus(terms)}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!m.archived && (
            <MemberQrButton memberId={m.id} owner={ctx.role === "OWNER"} />
          )}
          {manual && !m.archived && (
            <Button asChild variant="secondary">
              <Link href={`/whatsapp/new?memberId=${m.id}`}>
                <MessageCircle />
                WhatsApp
              </Link>
            </Button>
          )}
          <Dialog
            trigger={
              <Button variant="secondary">
                <Pencil />
                Edit member
              </Button>
            }
            title="Edit member"
          >
            <MemberForm member={m} />
          </Dialog>
          <ActionForm action="checkin" submit="Check in" className="">
            <input type="hidden" name="memberId" value={m.id} />
          </ActionForm>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-3 py-2.5 text-xs">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Phone size={13} />
          {m.contact.phone}
        </span>
        {m.email && (
          <span className="flex min-w-0 items-center gap-2 break-all text-muted-foreground">
            <Mail size={13} className="shrink-0" />
            {m.email}
          </span>
        )}
        <span className="text-muted-foreground">
          Joined {dateLabel(m.createdAt)}
        </span>
        <span className="ml-auto text-muted-foreground">
          Outstanding{" "}
          <strong
            className={`ml-1 font-semibold ${totalDue > 0 ? "text-amber-800" : "text-primary"}`}
          >
            {money(totalDue)}
          </strong>
        </span>
      </div>
      <MemberTabs
        sections={[
          {
            value: "memberships",
            label: "Memberships",
            content: (
              <div className="grid items-start gap-3 xl:grid-cols-[1.6fr_1fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Membership history</CardTitle>
                    <span className="text-[11px] text-muted-foreground">
                      {terms.length} terms
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!terms.length && (
                      <p className="py-2 text-sm text-muted-foreground">
                        No memberships.
                      </p>
                    )}
                    {terms.map((term) => (
                      <div
                        key={term.id}
                        className="border-t pt-3 first:border-0 first:pt-0"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">
                              {term.planName}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {dateLabel(term.startDate)} –{" "}
                              {dateLabel(term.endDate)}
                            </p>
                          </div>
                          <Badge>
                            {term.cancelledAt
                              ? "Cancelled"
                              : membershipStatus([term])}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          {term.charge && (
                            <Link
                              className="text-xs text-primary"
                              href={`/members/${m.id}?tab=payments`}
                              scroll={false}
                            >
                              {term.charge.voidedAt
                                ? "Fee waived"
                                : balance(term.charge) > 0
                                  ? `${money(balance(term.charge))} outstanding`
                                  : term.charge.amountPaise === 0
                                    ? "No payment required"
                                    : "Paid in full"}{" "}
                              ↗
                            </Link>
                          )}
                          {!term.cancelledAt && (
                            <Dialog
                              title="Cancel this membership?"
                              description="The membership ends immediately. Unpaid fees remain due unless an owner waives the charge."
                              trigger={
                                <Button variant="ghost" size="sm">
                                  Cancel membership
                                </Button>
                              }
                            >
                              <ActionForm
                                action="cancel-membership"
                                submit="Confirm cancellation"
                                variant="destructive"
                              >
                                <input
                                  type="hidden"
                                  name="membershipId"
                                  value={term.id}
                                />
                              </ActionForm>
                            </Dialog>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card id="renew">
                  <CardHeader>
                    <CardTitle>
                      {terms.length ? "Renew membership" : "Start a membership"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {m.archived ? (
                      <p className="text-sm text-muted-foreground">
                        Restore this member in Notes before assigning a
                        membership.
                      </p>
                    ) : (
                      <MembershipForm
                        key={m.id}
                        resetKey={`${m.id}:${m.memberships.length}`}
                        memberId={m.id}
                        plans={plans}
                        start={dayString(renewalStart(latest?.endDate ?? null))}
                        today={dayString(todayIST())}
                        firstMembership={m.memberships.length === 0}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            ),
          },
          {
            value: "payments",
            label: "Payments",
            content: <MemberPayments member={m} owner={ctx.role === "OWNER"} />,
          },
          {
            value: "attendance",
            label: "Attendance",
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Recent attendance</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    Last 30 check-ins
                  </span>
                </CardHeader>
                <CardContent>
                  {m.checkins.length ? (
                    <div className="flex flex-wrap gap-2">
                      {m.checkins.map((checkin) => (
                        <span
                          key={checkin.id}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground"
                        >
                          <Check size={12} className="text-primary" />
                          {dateLabel(checkin.day)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No check-ins recorded yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            value: "whatsapp",
            label: "WhatsApp",
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {manual ? "Manual message history" : "WhatsApp activity"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge>
                      {m.contact.optedOutAt
                        ? "WhatsApp stopped"
                        : "WhatsApp enabled"}
                    </Badge>
                  </div>
                  {manual ? (
                    <>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Last 20 messages
                      </p>
                      {history.length ? (
                        <div className="divide-y">
                          {history.map((message) => (
                            <details key={message.id} className="py-2.5">
                              <summary className="cursor-pointer text-xs">
                                <span className="mr-2 text-primary">
                                  Sent manually
                                </span>
                                {new Intl.DateTimeFormat("en-IN", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                  timeZone: "Asia/Kolkata",
                                }).format(message.createdAt)}
                              </summary>
                              <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                                {message.body}
                              </p>
                            </details>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No manual messages recorded for this member yet.
                        </p>
                      )}
                    </>
                  ) : (
                    <Link href="/whatsapp" className="text-sm text-primary">
                      View messaging activity ↗
                    </Link>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            value: "notes",
            label: "Notes",
            content: (
              <div className="space-y-3">
                <Card>
                  <CardHeader>
                    <CardTitle>Member notes</CardTitle>
                    <span className="text-[11px] text-muted-foreground">
                      Visible to your team
                    </span>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                      {m.notes ||
                        "No notes yet. Use Edit member to add a note."}
                    </p>
                  </CardContent>
                </Card>
                {ctx.role === "OWNER" && (
                  <Card className="p-3">
                    <p className="mb-3 text-xs text-muted-foreground">
                      Archived members keep their history and stop receiving
                      messages.
                    </p>
                    <ActionForm
                      action="archive"
                      submit={m.archived ? "Restore member" : "Archive member"}
                      variant="secondary"
                    >
                      <input type="hidden" name="memberId" value={m.id} />
                    </ActionForm>
                  </Card>
                )}
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
