import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { betterAuthBaseURL, onMainSite } from "./auth-base-url";
import { db } from "./db";
import { googleCredentials } from "./google-sign-in";
import { sendEmail } from "./mail";
const google = googleCredentials();
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: betterAuthBaseURL({
    baseUrl: process.env.BETTER_AUTH_URL,
    consoleUrl: process.env.CONSOLE_URL,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: google
    ? {
        google: {
          ...google,
          // Only /signup (which sends requestSignUp) creates accounts; sign-in on
          // /login or the console rejects an unknown Google email.
          disableImplicitSignUp: true,
          prompt: "select_account",
          accessType: "online",
          includeGrantedScopes: false,
        },
      }
    : {},
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      // Require the provider's verified email; do not bypass it by provider name.
      trustedProviders: [],
      allowDifferentEmails: false,
    },
  },
  onAPIError: { errorURL: "/login?auth_error=google" },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(
        user.email,
        "Reset your membrr password",
        `Reset your password: ${onMainSite(url, process.env.BETTER_AUTH_URL)}\nThis link expires in one hour.`,
      );
    },
  },
  user: {
    additionalFields: {
      platformAdmin: { type: "boolean", defaultValue: false, input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, storage: "database" },
  plugins: [nextCookies()],
});
