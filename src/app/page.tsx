import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { money } from "@/lib/domain";
import { SIGNUP_MONTHLY_FEE_PAISE, TRIAL_DAYS } from "@/lib/workspace-access";
import { CtaBand } from "@/components/landing/cta-band";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Nav } from "@/components/landing/nav";
import { Pricing } from "@/components/landing/pricing";

export const dynamic = "force-dynamic";

const description =
  "A little less admin. A lot more community. Membership operations for independent gyms and sports arenas: members, plans, payments, attendance and WhatsApp reminders.";

export const metadata: Metadata = {
  title: { absolute: "membrr · Memberships, made simple" },
  description,
  openGraph: {
    title: "membrr · Memberships, made simple",
    description,
    type: "website",
  },
};

export default async function Home() {
  // An invalid or expired session is the same as being signed out.
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  const signedIn = Boolean(session);
  const feeLabel = money(SIGNUP_MONTHLY_FEE_PAISE);
  return (
    <>
      <Nav signedIn={signedIn} />
      <main>
        <Hero signedIn={signedIn} trialDays={TRIAL_DAYS} />
        <Features />
        <HowItWorks />
        <Pricing
          feeLabel={feeLabel}
          trialDays={TRIAL_DAYS}
          signedIn={signedIn}
        />
        <Faq feeLabel={feeLabel} trialDays={TRIAL_DAYS} />
        <CtaBand signedIn={signedIn} />
      </main>
      <Footer signedIn={signedIn} />
    </>
  );
}
