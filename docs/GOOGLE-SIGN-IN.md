# Set up Google sign-in

Google signup and sign-in are available alongside email/password. New Google users create their workspace after signing in; existing users keep their workspace and permissions. Password sign-in remains available.

## 1. Create the Google OAuth client

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview). Select an existing Google Cloud project or create a project for membrr.
2. If prompted, choose **Get started**. Enter the app name **membrr**, your support email, and your contact email.
3. Under **Audience**, choose **External** if you want to support personal Gmail accounts or accounts outside your own Google Workspace. While the app is in **Testing**, add your Google email and the emails of any pilot users under **Test users**.
4. Open **Clients → Create client**, choose **Web application**, and give it a name such as **membrr Azure**. In the older console navigation this is **APIs & Services → Credentials → Create credentials → OAuth client ID**.
5. Add this **Authorized JavaScript origin**:

   ```text
   https://pep-b5f5axg9fjgucsg8.centralindia-01.azurewebsites.net
   ```

6. Add this **Authorized redirect URI**, exactly as shown:

   ```text
   https://pep-b5f5axg9fjgucsg8.centralindia-01.azurewebsites.net/api/auth/callback/google
   ```

7. Click **Create** and keep the resulting **Client ID** and **Client secret** for the next step.

The app requests only basic Google identity scopes: `openid`, `email`, and `profile`. For public use beyond your test users, complete Google's consent-screen requirements and publish the audience when ready.

## 2. Add the credentials to Azure

In **App Services → pep → Settings → Environment variables → App settings**, add:

| Setting | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The client ID from Google, usually ending in `.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | The client secret from Google |

Keep `BETTER_AUTH_URL` set to:

```text
https://pep-b5f5axg9fjgucsg8.centralindia-01.azurewebsites.net
```

Apply/save the settings. These are server settings; neither is prefixed with `NEXT_PUBLIC_`. Keep your existing `BETTER_AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` unchanged. Google OAuth tokens are encrypted using Better Auth's existing secret.

## 3. Deploy the updated application

Upload the regenerated `artifacts/membrr-azure-source.zip` through **Deployment Center → Manual Deployment (Push) → Publish files (new)**. Keep Azure build automation enabled, as described in [the Azure deployment guide](AZURE-DEPLOYMENT.md).

The **Continue with Google** button appears on signup and login only when both Google settings are configured. Both pages read this at request time, so adding credentials after the build does not require another source change; apply the settings and restart the app if needed.

## 4. Create an account or sign in

1. New users choose **Continue with Google** on signup; returning users can also use it on login. Only signup creates an account: choosing Google on login with an email membrr doesn't know shows "No membrr account uses this Google email" and creates nothing.
2. New users enter workspace name and city on `/onboarding`. This creates owner access, a main branch, and a ₹499/month workspace with a three-day trial starting when their account was created. A password and invitation are not required.
3. Returning users open their existing workspace. Existing password accounts can link only when both Google and membrr have verified the same email. Pending invited users should accept their invitation first to join the invited workspace.
4. Interrupted setup resumes after the next sign-in. Repeated submissions do not create extra workspaces or extend a trial. Google signup never grants platform administrator access.

If the first platform administrator has not been created, use the existing `npm run bootstrap` process from the Azure deployment guide with your Google email as `ADMIN_EMAIL`. That administrator can then use either Google or the chosen bootstrap password. Creating a Google Cloud OAuth client alone does not create a membrr administrator.

## Google sign-in on the admin console

The admin console at `https://console.membrr.pro` shows **Continue with Google** when the same two Google settings are present. Google returns to the console host only when `CONSOLE_URL` is set (`https://console.membrr.pro`); the console has its own host and cookies, so the flow cannot pass through the main site. Add these to the **same** OAuth client from step 1:

- **Authorized JavaScript origin:** `https://console.membrr.pro`
- **Authorized redirect URI:** `https://console.membrr.pro/api/auth/callback/google`

Keep the existing main-site entries. Without the new redirect URI, Google shows `redirect_uri_mismatch` on the console only.

Google signs in only people who already have console access (`platformAdmin`). Any other Google account is signed out and shown "This account doesn't have console access." A Google email with no membrr account gets the same message, and no user record is created.

Password-reset emails always link to the main site, even when requested from the console host.

## Troubleshooting

- **No Google button:** confirm that the updated ZIP was deployed, that both Google settings have nonblank values, and that Azure has restarted after applying them.
- **`redirect_uri_mismatch`:** the authorized redirect URI in Google must match the full callback URL above, including `https` and `/api/auth/callback/google`.
- **Google blocks a test user:** add that user's Google email to the consent screen's Test users while the Google app is in Testing.
- **membrr asks you to create a workspace:** complete workspace name and city. If you were invited to someone else's workspace, accept that invitation before using Google signup.
- **Account cannot be linked:** select the exact email used by your verified membrr account, or use your existing password. Both Google and membrr must have verified that email.

## Verification

Ten authentication tests use the application's actual Better Auth configuration with an isolated memory database and simulated Google token/profile responses. They cover OAuth redirect and PKCE, new-user signup, returning-user sign-in, existing-account linking, password fallback, encrypted token storage, verified-email requirements, state-cookie validation, cancelled sign-in, and disabled raw password signup. Two browser tests run against the normal local server using Google token/profile simulation confined to the test process. They verify workspace setup, a 72-hour trial, ₹499/month, returning users, duplicate setup, trial expiry, and rejection of unverified identities. Real Google consent and token exchange remain for the user to complete personally.

On 4 October 2026, all eight authentication tests, TypeScript checks, and the production build passed. The built application was checked in a browser at desktop and 390-pixel mobile widths with local preview credentials supplied only at runtime. The Google button appeared after building without Google credentials. A simulated connection failure showed the recovery message and restored both buttons; an unknown-account callback displayed the invitation guidance. The temporary browser and local server were closed afterward.

Later on 4 October 2026, both Google credentials were confirmed present in Azure and the updated ZIP was deployed successfully (deployment `48ef080f-09a4-4651-8b9c-3118efe2888d`). The first live sign-in attempt exposed an empty production schema; all seven existing migrations were then applied successfully. Because the deployed runtime lacked the Prisma CLI, migration tools were installed in a separate temporary maintenance directory, leaving the running application's dependencies unchanged. The user-designated first administrator was provisioned for Google sign-in without a password credential. The live Google button now reaches Google's email/password sign-in screen. The actual Google account login and authenticated return to membrr remain for the user to complete.

Reference: [Better Auth Google provider](https://www.better-auth.com/docs/authentication/google).
