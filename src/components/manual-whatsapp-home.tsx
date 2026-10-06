import Link from "next/link";
import { Plus, ArrowUpRight, CalendarClock, Wallet } from "lucide-react";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { dateLabel, money } from "@/lib/domain";
import { manualFollowUps } from "@/lib/manual-whatsapp";
import { PageHeading } from "./page-heading";
import { Card, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Empty } from "./empty";

export default async function ManualWhatsAppHome({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await getContext();
  const params = await searchParams;
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(params.page) || 1)),
  );
  const [{ renewals, dues }, history, total] = await Promise.all([
    manualFollowUps(ctx),
    db.manualSend.findMany({
      where: { businessId: ctx.businessId },
      include: { member: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: (page - 1) * 20,
    }),
    db.manualSend.count({ where: { businessId: ctx.businessId } }),
  ]);
  return (
    <>
      <PageHeading
        title="WhatsApp"

        action={
          ctx.role === "OWNER" && (
            <Button asChild>
              <Link href="/whatsapp/new">
                <Plus />
                New announcement
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 grid items-start gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <CalendarClock size={16} className="mr-2 inline text-primary" />
              Membership follow-ups
            </CardTitle>
            <Link
              href="/members?status=expiring"
              className="text-xs text-muted-foreground"
            >
              View members ↗
            </Link>
          </CardHeader>
          <p className="px-3 pb-3 text-[11px] text-muted-foreground">
            Expiring in the next 7 days or expired in the last 7 days. Up to 20
            shown.
          </p>
          {renewals.length ? (
            <div className="divide-y">
              {renewals.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div>
                    <Link
                      href={`/members/${t.memberId}`}
                      className="text-sm font-medium"
                    >
                      {t.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expiry: {dateLabel(t.endDate)}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" asChild>
                    <Link
                      href={`/whatsapp/new?memberId=${t.memberId}&kind=RENEWAL&referenceId=${t.id}`}
                    >
                      Prepare reminder
                      <ArrowUpRight />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No membership follow-ups" />
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <Wallet size={16} className="mr-2 inline text-primary" />
              Unpaid fee follow-ups
            </CardTitle>
            <Link href="/payments" className="text-xs text-muted-foreground">
              View payments ↗
            </Link>
          </CardHeader>
          <p className="px-3 pb-3 text-[11px] text-muted-foreground">
            Due or overdue balances, oldest first. Up to 20 shown.
          </p>
          {dues.length ? (
            <div className="divide-y">
              {dues.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div>
                    <Link
                      href={`/members/${c.memberId}`}
                      className="text-sm font-medium"
                    >
                      {c.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {money(Number(c.outstanding))} · Due{" "}
                      {dateLabel(c.dueDate)}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" asChild>
                    <Link
                      href={`/whatsapp/new?memberId=${c.memberId}&kind=DUES&referenceId=${c.id}`}
                    >
                      Prepare reminder
                      <ArrowUpRight />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No unpaid fees due" />
          )}
        </Card>
      </div>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Manual message history</CardTitle>
          </div>
          <Badge>{total} recorded</Badge>
        </CardHeader>
        {history.length ? (
          <div className="divide-y">
            {history.map((m) => (
              <div key={m.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    className="text-sm font-medium"
                    href={`/members/${m.memberId}`}
                  >
                    {m.member.name}
                  </Link>
                  <Badge>Sent manually</Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {m.phone} · Recorded {dateLabel(m.createdAt)}
                </p>
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-primary">
                    View message
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">
                    {m.body}
                  </p>
                </details>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Your manual messages will appear here" />
        )}
        <div className="flex justify-end gap-3 border-t p-3 text-xs">
          {page > 1 && (
            <Link href={`/whatsapp?page=${page - 1}`}>Previous</Link>
          )}
          {page * 20 < total && (
            <Link href={`/whatsapp?page=${page + 1}`}>Next</Link>
          )}
        </div>
      </Card>
    </>
  );
}
