import { steps } from "./content";

export function HowItWorks() {
  return (
    <section id="how" className="border-y bg-card">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Up and running in an afternoon
        </h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span className="flex size-10 items-center justify-center rounded-full bg-brand-gradient-soft text-sm font-semibold text-white">
                {i + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {s.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
