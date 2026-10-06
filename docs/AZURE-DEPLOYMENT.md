# Azure App Service ZIP deployment

Use **Deployment Center → Manual Deployment (Push) → Publish files (new)**.

The upload file is `artifacts/membrr-azure-source.zip`. Recreate it with `pwsh -File ops/package-azure.ps1` after changing application source. It contains application source, the dependency lockfile, database migrations, and the build/admin bootstrap scripts. Dependencies and the Next.js output must be built on Azure's Linux host. This is a source ZIP, not a prebuilt app.

## Settings before upload

In **Settings → Environment variables → App settings**, configure:

| Name | Value |
| --- | --- |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |
| `ENABLE_ORYX_BUILD` | `true` |
| `NPM_CONFIG_PRODUCTION` | `false` (install the build tools in devDependencies) |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | The connection URI for the new Azure PostgreSQL database, with TLS enabled |
| `BETTER_AUTH_URL` | `https://pep-b5f5axg9fjgucsg8.centralindia-01.azurewebsites.net` |
| `BETTER_AUTH_SECRET` | A new cryptographically random secret of at least 32 characters |
| `CREDENTIAL_ENCRYPTION_KEY` | A separate cryptographically random 32-byte key encoded as 64 hexadecimal characters |
| `WHATSAPP_MODE` | `manual` |
| `ALLOW_LOCAL_EMAIL_LOG` | `false` |

For optional Google sign-in, also configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` using [the Google sign-in setup guide](GOOGLE-SIGN-IN.md). Both are required before the Google button appears. Existing password sign-in remains enabled.

The portal created `AZURE_POSTGRESQL_HOST`, `AZURE_POSTGRESQL_USER`, `AZURE_POSTGRESQL_PASSWORD`, `AZURE_POSTGRESQL_DATABASE`, `AZURE_POSTGRESQL_PORT`, and `AZURE_POSTGRESQL_SSL`. This app reads `DATABASE_URL`; those separate values are not automatically mapped by its current code. Construct the PostgreSQL URI using those values, percent-encode the username/password/database components, and use TLS (`sslmode=require`). Keep the URI and generated secrets in Azure app settings and a secure password manager, outside this ZIP and chat.

Keep **Stack settings → Node.js 24 LTS**. Set **Configuration → General settings → Startup Command** to:

```sh
HOSTNAME=0.0.0.0 npm start
```

Use the port provided by App Service; do not hardcode a local port. Enable **Always On** for the paid App Service plan. If `WEBSITE_RUN_FROM_PACKAGE` is present, remove that setting for this source-build deployment flow.

## Upload and initialize

For every update, check all migration directories in the source bundle against
production, even if the requested feature introduces no migration of its own.
Review and apply pending migrations with `prisma migrate deploy` from an
Azure-connected maintenance environment before activating code that requires
them. Do not assume a successful build or a database connectivity check proves
schema compatibility. The health endpoint must return HTTP 200 with
`schema: ready` after deployment; HTTP 503 with `schema: outdated` means the
deployed client requires missing tables or columns. This check reads metadata
only and does not expose table names or member data in the public response.

1. Apply the settings, then upload the ZIP using **Publish files (new)**. The ZIP has `package.json` at its root. Azure should install dependencies and run `npm run build`; verify these steps in the deployment logs.
2. In the app's SSH session, use the deployed application directory containing `package.json`. Run `npm run db:migrate` to initialize the fresh production database. This command changes the database schema. Do not run the development seed on production.
3. Supply `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 16 characters), and optionally `ADMIN_NAME` securely in the SSH session, then run `npm run bootstrap`. Remove the bootstrap variables afterward. This creates the first platform administrator without overwriting any existing account.
4. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` before inviting business owners or using password recovery.
5. Verify `/api/health`, sign-in, static assets, and database access. Set App Service's Health Check path to `/api/health` after migrations. Test a real invitation email before onboarding.

## Verification status

Review-fixes update, 6 October 2026: deployment
`15ddd116-453c-459d-bb23-123a5fbd736d` shipped the report-export and
health-check fixes. It reached `RuntimeSuccessful`, and live health returns
HTTP 200 with `schema: ready`. No migration or setting change was needed. The
ZIP was packaged with Windows PowerShell 5.1, which `ops/package-azure.ps1` now
supports, and deployed with `az webapp deploy`. The app's subscription
(`fff8375e-…`) belongs to a different Azure login from this machine's default.
Use a separate session such as
`AZURE_CONFIG_DIR=.local/azure-pep az login --tenant e00ad81d-d2be-4dba-a8a8-3bd7585a7fd2`
(the tenant requires MFA), and delete that folder afterwards. See
[the verification record](VERIFICATION.md).

Current update, 5 October 2026: applied the four previously pending migrations
for business logos, membership billing, member documents and the member-photo
relation. Production now has all twelve repository migrations. Deployment
`c87edea3-0a5c-48b8-850c-fc4cc2cc3252` adds schema readiness checks to health
reporting; the live endpoint returns HTTP 200 with `database: up` and
`schema: ready`. The previous reports release had passed connectivity checks
despite missing schema required by shared components. See the repair entry in
[the verification record](VERIFICATION.md).

Reports update, 4 October 2026: deployment `728ea6ab-88a1-469d-9817-87c10478b4b4` added member, collection, dues, renewal and attendance reports with CSV exports. Azure's Linux build and runtime startup succeeded; all nine changed deployment files match local SHA-256 hashes and the live database health check passes. No migration or configuration change was needed. See [the current verification record](VERIFICATION.md).

Latest update, 4 October 2026: deployment `c26e9875-6daa-4d8f-959d-008ee28bb7c1` removed the member profile's **Stop WhatsApp** control and its server action. Messaging remains enabled by default, with existing opt-outs and inbound STOP handling preserved. Azure's Linux build and runtime startup succeeded; both changed application files match deployed source and the live database health check passes. No migration or configuration change was required. Google signup, admin creation without invitations, three-day trials, and the ₹499 monthly fee remain available, with all eight migrations applied. Production Razorpay credentials still need configuration before checkout is available. See [the current verification record](VERIFICATION.md).

On 4 October 2026, read-only Azure checks confirmed that `pep` is running with `NODE|24-lts`, a PostgreSQL server named `pep-server` exists in its resource group, and the web app has the six `AZURE_POSTGRESQL_*` settings. The startup command was empty and the additional app/build settings above were absent. ZIP structure was checked locally. No Azure settings, deployed application, or database were changed while preparing this package. Azure build, connectivity, migrations, and application operation still need verification.

### Blank database connection during the first upload

The supplied deployment log failed at `prisma generate` with `Cannot resolve environment variable: DATABASE_URL`. A subsequent live check found that `DATABASE_URL` existed but was blank, while both newly configured secrets had the expected format. The startup command was also still empty.

The user approved setting the database connection, startup command, and retrying deployment. Automatic approval review nevertheless blocked the agent's configuration update before execution. No Azure changes or retry were performed by the agent.

To apply the prepared repair from the user's own Windows PowerShell window, run:

```powershell
& 'C:\Users\AR\Documents\PassMark\Softares\Membership Management\ops\repair-azure-deployment.ps1'
```

This script reads the existing Azure PostgreSQL settings, fills `DATABASE_URL` only if blank, percent-encodes credentials, enables TLS, sets and verifies the startup command, and uploads the existing source ZIP. It preserves the two secret keys. Credential values are not printed; the temporary credential file is restricted to the current Windows user and removed after the setting update. The script is prepared for manual execution; it has not been run by the agent.

References: [Azure ZIP build automation](https://learn.microsoft.com/azure/app-service/deploy-zip#enable-build-automation-for-zip-deploy), [Node.js configuration](https://learn.microsoft.com/azure/app-service/configure-language-nodejs).
