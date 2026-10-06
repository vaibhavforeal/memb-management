import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background/50 px-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 disabled:opacity-50 sm:h-9",
        className,
      )}
      {...props}
    />
  );
}
export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-md border border-input bg-background/50 p-2.5 text-sm text-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground sm:h-9",
        className,
      )}
      {...props}
    />
  );
}
