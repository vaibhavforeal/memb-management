import Link from "next/link";
import { ProductMockup } from "./product-mockup";

const primary =
  "inline-flex h-11 items-center justify-center rounded-md bg-white px-5 text-sm font-semibold text-[#0b1f4b] shadow-sm transition-colors hover:bg-sky-50 focus-visible:outline-white";
const secondary =
  "inline-flex h-11 items-center justify-center rounded-md border border-white/35 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-white";

export function Hero({
  signedIn,
  trialDays,
}: {
  signedIn: boolean;
  trialDays: number;
}) {
  return (
    <section className="bg-brand-gradient text-white">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-14">
        <div>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-[-1.5px] sm:text-5xl lg:text-[50px]">
            <span className="block">A little less admin.</span>
            <span className="block">A lot more community.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/80">
            membrr runs memberships for independent gyms and sports arenas:
            members, plans, payments, attendance and WhatsApp reminders in one
            place.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className={primary}
            >
              {signedIn ? "Go to dashboard" : "Start free trial"}
            </Link>
            <a href="#how" className={secondary}>
              See how it works
            </a>
          </div>
          {!signedIn && (
            <p className="mt-5 text-sm text-white/70">
              Free for {trialDays} days. No card required.
            </p>
          )}
        </div>
        <ProductMockup />
      </div>
    </section>
  );
}
