import { features } from "./content";

export function Features() {
  return (
    <section
      id="features"
      className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6"
    >
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.6fr] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything the front desk needs
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
            Built for the way independent gyms and arenas actually run: cash and
            UPI at the counter, renewals by WhatsApp, a phone at the door.
          </p>
        </div>
        <ul className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="bg-card p-6">
              <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
