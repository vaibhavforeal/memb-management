"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { GoogleIcon } from "./google-icon";

export function SignupForm({
  googleEnabled = false,
  initialError = "",
}: {
  googleEnabled?: boolean;
  initialError?: string;
}) {
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState(initialError);
  const [created, setCreated] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const input = Object.fromEntries(new FormData(event.currentTarget));
        setPending("email");
        setError("");
        try {
          const response = await fetch("/api/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          const result = await response.json();
          if (!response.ok) {
            setError(result.message || "Unable to create your account.");
            return;
          }
          setCreated(true);
          const session = await authClient.signIn.email({
            email: String(input.email).trim().toLowerCase(),
            password: String(input.password),
          });
          if (session.error)
            setError(
              "Your workspace is ready. Sign in with your email and password to start using it.",
            );
          else window.location.href = "/dashboard";
        } catch {
          setError(
            "Unable to connect. If your account was created, sign in to continue.",
          );
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
                  errorCallbackURL: "/signup?auth_error=google",
                  requestSignUp: true,
                });
                if (result.error) {
                  setError(
                    "Google signup could not start. Try again or use email.",
                  );
                  setPending(null);
                }
              } catch {
                setError(
                  "Unable to connect to Google. Try again or use email.",
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
            or sign up with email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <label className="field">
        Your name
        <Input
          required
          name="name"
          autoComplete="name"
          minLength={2}
          maxLength={100}
        />
      </label>
      <label className="field">
        Email address
        <Input
          required
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
        />
      </label>
      <label className="field">
        Password
        <Input
          required
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
        />
        <span>Use 12–128 characters.</span>
      </label>
      <label className="field">
        Workspace name
        <Input
          required
          name="businessName"
          autoComplete="organization"
          minLength={2}
          maxLength={100}
          placeholder="Your gym or sports arena"
        />
      </label>
      <label className="field">
        City
        <Input
          required
          name="city"
          autoComplete="address-level2"
          minLength={2}
          maxLength={100}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {created ? (
        <Link href="/login" className="block text-sm text-primary">
          Sign in to your new workspace →
        </Link>
      ) : (
        <Button type="submit" className="w-full" disabled={pending !== null}>
          {pending === "email"
            ? "Creating your workspace…"
            : "Start free trial"}
        </Button>
      )}
    </form>
  );
}
