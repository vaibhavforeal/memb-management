import Link from "next/link";

export function CtaBand({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
      <div className="rounded-2xl bg-brand-gradient px-6 py-10 text-center text-white sm:px-12">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Spend less time on spreadsheets and more time on your members
        </h2>
        <Link
          href={signedIn ? "/dashboard" : "/signup"}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-white px-6 text-sm font-semibold text-[#0b1f4b] shadow-sm transition-colors hover:bg-sky-50 focus-visible:outline-white"
        >
          {signedIn ? "Go to dashboard" : "Start free trial"}
        </Link>
      </div>
    </section>
  );
}
