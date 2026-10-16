import { afterEach, describe, expect, it, vi } from "vitest";
import {
  googleCredentials,
  googleSignInEnabled,
  googleSignInError,
} from "../src/lib/google-sign-in";

afterEach(() => vi.unstubAllEnvs());

describe("googleCredentials", () => {
  it("needs both values, trimmed", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", " id.apps.googleusercontent.com ");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", " secret ");
    expect(googleCredentials()).toEqual({
      clientId: "id.apps.googleusercontent.com",
      clientSecret: "secret",
    });
    expect(googleSignInEnabled()).toBe(true);
  });

  it("is off when either value is blank", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "   ");
    expect(googleCredentials()).toBeNull();
    expect(googleSignInEnabled()).toBe(false);
  });
});

describe("googleSignInError", () => {
  it("explains an unlinked account", () => {
    expect(googleSignInError({ error: "account_not_linked" })).toBe(
      "Use your verified membrr email with Google, or sign in with your password.",
    );
  });

  it("tells an unknown Google account to sign up first", () => {
    expect(googleSignInError({ error: "signup_disabled" })).toBe(
      "No membrr account uses this Google email. Sign up first, or sign in with your password.",
    );
  });

  it("gives a generic message for any other Google failure", () => {
    expect(googleSignInError({ auth_error: "google" })).toBe(
      "Google sign-in was not completed. Try again or use your password.",
    );
    expect(googleSignInError({ error: "access_denied" })).toBe(
      "Google sign-in was not completed. Try again or use your password.",
    );
  });

  it("is empty without an error", () => {
    expect(googleSignInError({})).toBe("");
  });
});
