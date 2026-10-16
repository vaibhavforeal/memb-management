/** Google sign-in is on only when both server credentials are non-blank. */
export function googleCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function googleSignInEnabled(): boolean {
  return googleCredentials() !== null;
}

/**
 * Message for a sign-in page Google returned to. `auth_error` is set by our
 * errorCallbackURL; Better Auth appends its own `error` code (e.g.
 * signup_disabled, account_not_linked, access_denied).
 */
export function googleSignInError(query: {
  error?: string;
  auth_error?: string;
}): string {
  if (query.error === "signup_disabled")
    return "No membrr account uses this Google email. Sign up first, or sign in with your password.";
  if (query.error === "account_not_linked")
    return "Use your verified membrr email with Google, or sign in with your password.";
  if (query.error || query.auth_error)
    return "Google sign-in was not completed. Try again or use your password.";
  return "";
}
