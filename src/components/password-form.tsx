"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function PasswordForm({ token }: { token?: string }) {
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.currentTarget.reportValidity();
        e.preventDefault();
        setPending(true);
        const f = new FormData(e.currentTarget);
        try {
          const r = token
            ? await authClient.resetPassword({
                token,
                newPassword: String(f.get("password")),
              })
            : await authClient.requestPasswordReset({
                email: String(f.get("email")),
                redirectTo: "/reset-password",
              });
          setMessage(
            r.error?.message ??
              (token
                ? "Password updated. You can now sign in."
                : "If an account exists, a reset link has been sent to its email address."),
          );
        } catch {
          setMessage("The request could not be completed. Try again.");
        } finally {
          setPending(false);
        }
      }}
    >
      {token ? (
        <label className="field">
          New password
          <Input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
      ) : (
        <label className="field">
          Your email
          <Input type="email" required name="email" autoComplete="email" />
        </label>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      <Button disabled={pending}>
        {pending
          ? "Please wait…"
          : token
            ? "Set new password"
            : "Send reset link"}
      </Button>
    </form>
  );
}
