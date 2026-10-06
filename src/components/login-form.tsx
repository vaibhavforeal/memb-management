"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { GoogleIcon } from "./google-icon";
export function LoginForm({
  demo = false,
  googleEnabled = false,
  initialError = "",
}: {
  demo?: boolean;
  googleEnabled?: boolean;
  initialError?: string;
}) {
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending("email");
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const result = await authClient.signIn.email({
            email: String(f.get("email")),
            password: String(f.get("password")),
          });
          if (result.error)
            setError(result.error.message ?? "Unable to sign in.");
          else window.location.href = "/dashboard";
        } catch {
          setError("Unable to connect. Try again.");
        } finally {
          setPending(null);
        }
      }}
    >
      {googleEnabled && (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending !== null}
            onClick={async () => {
              setError("");
              setPending("google");
              try {
                const result = await authClient.signIn.social({
                  provider: "google",
                  callbackURL: "/dashboard",
                  newUserCallbackURL: "/onboarding",
                  errorCallbackURL: "/login?auth_error=google",
                });
                if (result.error) {
                  setError(
                    "Google sign-in could not start. Try again or use your password.",
                  );
                  setPending(null);
                }
              } catch {
                setError(
                  "Unable to connect to Google. Try again or use your password.",
                );
                setPending(null);
              }
            }}
          >
            <GoogleIcon />
            {pending === "google"
              ? "Connecting to Google…"
              : "Continue with Google"}
          </Button>

          <div className="flex items-center gap-3 py-1 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or sign in with email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <label className="field">
        Email address
        <Input
          required
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@yourclub.com"
          defaultValue={demo ? "owner@membrr.local" : undefined}
        />
      </label>
      <label className="field">
        Password
        <Input
          required
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          defaultValue={demo ? "MembrrDemo!2026" : undefined}
        />
      </label>
      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-xs text-muted-foreground hover:text-primary"
        >
          Forgot password?
        </Link>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={pending !== null}>
        {pending === "email" ? "Signing in…" : "Sign in"}
      </Button>
      {demo && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
          Demo account
        </div>
      )}
    </form>
  );
}
