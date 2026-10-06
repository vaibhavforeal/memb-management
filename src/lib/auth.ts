import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { sendEmail } from "./mail";
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            disableSignUp: false,
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
        `Reset your password: ${url}\nThis link expires in one hour.`,
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
