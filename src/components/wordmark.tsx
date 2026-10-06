import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

// Placeholder wordmark until the logo arrives; every brand mark in the app
// renders through this component so the swap happens in one file.
export function Wordmark({
  tone = "dark",
  className,
}: {
  tone?: "dark" | "light";
  className?: string;
}) {
  const light = tone === "light";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-xl font-semibold tracking-[-0.8px]",
        light ? "text-white" : "text-foreground",
        className,
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-sm">
        <Activity size={20} strokeWidth={2.5} aria-hidden />
      </span>
      <span>
        membrr<span className={light ? "text-sky-300" : "text-primary"}>.</span>
      </span>
    </span>
  );
}
