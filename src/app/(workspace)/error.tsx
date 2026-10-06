"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h1 className="text-xl font-semibold">We couldn’t load this page</h1>
      <p className="my-4 text-sm text-muted-foreground">
        Your data is safe. Try again, or ask your administrator to check the
        connection.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
