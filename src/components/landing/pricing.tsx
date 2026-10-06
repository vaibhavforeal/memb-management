import Link from "next/link";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const included = [
  "Unlimited members and membership plans",
  "Payments, receipts and bills",
  "QR attendance for the front desk",
  "WhatsApp reminders and message history",
  "Reports and CSV export",
  "Owner and staff access",
];

export function Pricing({
  feeLabel,
  trialDays,
  signedIn,
}: {
  feeLabel: string;
  trialDays: number;
  signedIn: boolean;
}) {
  return (
    <section
      id="pricing"
      className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6"
    >
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            One simple price
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            Start with a free trial of {trialDays} days. If membrr doesn&apos;t
            save you time, walk away. There is nothing to cancel and no card on
            file.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-8 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            membrr for your business
          </p>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-5xl font-semibold tabular-nums tracking-tight">
              {feeLabel}
            </span>
            <span className="text-sm text-muted-foreground">per month</span>
          </p>
          <ul className="mt-6 space-y-3">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm">
                <Check
                  size={16}
                  className="mt-0.5 shrink-0 text-primary"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
          <Link
            href={signedIn ? "/dashboard" : "/signup"}
            className={cn(buttonVariants(), "mt-8 h-11 w-full text-sm")}
          >
            {signedIn ? "Go to dashboard" : "Start free trial"}
          </Link>
        </div>
      </div>
    </section>
  );
}
