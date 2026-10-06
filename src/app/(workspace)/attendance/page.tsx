import Link from "next/link";
import { Search, CheckCircle2 } from "lucide-react";
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/domain";
import { memberFilter } from "@/lib/services";
import { PageHeading } from "@/components/page-heading";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { Empty } from "@/components/empty";
import { AttendanceScanner } from "@/components/attendance-scanner";
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getContext(),
    { q = "" } = await searchParams;
  const today = todayIST();
  const [checkins, members] = await Promise.all([
    db.checkin.findMany({
      where: { businessId: ctx.businessId, day: today },
      include: { member: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.member.findMany({
      where: memberFilter(ctx.businessId, q.slice(0, 100), "active"),
      take: 20,
      include: { checkins: { where: { day: today } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <>
      <PageHeading
        title="Show up. Check in."

        action={<AttendanceScanner />}
      />
      <div className="grid items-start gap-3 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Find a member</CardTitle>
          </CardHeader>
          <form className="flex gap-3 px-3 pb-3">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search by name, phone, or member ID"
              aria-label="Find a member to check in"
            />
            <Button variant="secondary">
              <Search />
              Search
            </Button>
          </form>
          <div className="divide-y">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <Link
                  href={`/members/${m.id}`}
                  className="flex items-center gap-3"
                >
                  <Avatar name={m.name} />
                  <span>
                    <span className="block text-xs font-medium">{m.name}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {m.code}
                    </span>
                  </span>
                </Link>
                {m.checkins.length ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-primary">
                    <CheckCircle2 size={14} />
                    Checked in
                  </span>
                ) : (
                  <ActionForm action="checkin" submit="Check in" className="">
                    <input type="hidden" name="memberId" value={m.id} />
                  </ActionForm>
                )}
              </div>
            ))}
          </div>
          {!members.length && (
            <Empty
              title="No active members found"
              description="Try a different search or activate the member’s membership first."
            />
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Showing up to 20 active members.
          </p>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Today’s check-ins</CardTitle>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              {checkins.length}
            </span>
          </CardHeader>
          <div className="divide-y">
            {checkins.map((c) => (
              <div key={c.id} className="flex justify-between px-3 py-2.5">
                <Link className="text-xs" href={`/members/${c.memberId}`}>
                  {c.member.name}
                  {c.source === "QR" && (
                    <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      QR
                    </span>
                  )}
                </Link>
                <span className="text-[11px] text-muted-foreground">
                  {new Intl.DateTimeFormat("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  }).format(c.createdAt)}
                </span>
              </div>
            ))}
          </div>
          {!checkins.length && (
            <Empty
              title="A fresh day starts here"
              description="Your first check-in will appear here."
            />
          )}
        </Card>
      </div>
    </>
  );
}
