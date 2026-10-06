"use client";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
export function SignoutButton() {
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await authClient.signOut();
        window.location.href = "/login";
      }}
    >
      Sign out
    </Button>
  );
}
