import { ChevronDown } from "lucide-react";
import { buildFaqs } from "./content";

export function Faq({
  feeLabel,
  trialDays,
}: {
  feeLabel: string;
  trialDays: number;
}) {
  return (
    <section id="faq" className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
      <div className="max-w-3xl">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Questions owners ask
        </h2>
        <div className="mt-8 divide-y border-y">
          {buildFaqs(feeLabel, trialDays).map(({ q, a }) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown
                  size={18}
                  aria-hidden
                  className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
