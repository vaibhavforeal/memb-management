# membrr

A self-hosted membership platform for Indian gyms and sports arenas. Next.js + TypeScript, PostgreSQL/Prisma, and Better Auth. WhatsApp sending is **manual by default**: prepare a message and send it yourself from your regular WhatsApp account. One branch per business; independent business data and owner/staff permissions.

## What is implemented

- Member directory, search, filters, editing, archival, CSV preview/import and owner-only export.
- Membership plans, separate historical terms, activation, early/late renewals and cancellation.
- Charges, partial payments, printable receipts, owner-only recorded reversals and charge waivers.
- Daily staff check-in, individual member QR cards, camera/image scanning and member attendance history.
- Database-backed dashboard with collections, balances, active memberships and upcoming renewals.
- Editable WhatsApp messages, member chat links, expiry/fee follow-up lists, and owner announcements sent one recipient at a time.
- Image and document uploads with reusable, expiring download links in manual WhatsApp messages.
- Consent/opt-out checks and manual message history, recorded only after a user confirms sending. No delivery/read claims are made.
- An optional Meta Cloud API integration is retained for later use and disabled in manual mode.
- Staff invitation/password recovery, platform business administration, suspension, and audited 30-minute support access.
- Optional Google sign-in alongside passwords for existing verified accounts; see [Google sign-in setup](docs/GOOGLE-SIGN-IN.md).
- Docker Compose, Caddy HTTPS, migrations, encrypted restic backups, restore drill and external health-monitor hooks.

Manual WhatsApp needs no Meta account setup, API token, or template approval. SMTP is still needed for real staff invitations/password resets. Messages are sent by the WhatsApp account signed into the user's device; membrr does not send them automatically.

## Local development on this machine

Requires Node.js 24 and npm. PostgreSQL can be run without a system install using the bundled development-only embedded-postgres package.

```sh
npm ci
npm run db:local
```

Keep the database process running. On first run it creates `.env` with random development secrets, binds PostgreSQL to `127.0.0.1:54329`, and stores data under `.local/postgres`.

In another terminal:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

No messaging worker is needed in manual mode. `WHATSAPP_MODE=manual` is the default, including when that environment variable is absent. Only the explicit value `cloud` enables the optional API integration.

Open [http://localhost:3000](http://localhost:3000).

| Local sample account   | Email                 | Password           |
| ---------------------- | --------------------- | ------------------ |
| Owner                  | owner@membrr.local | MembrrDemo!2026 |
| Staff                  | staff@membrr.local | MembrrDemo!2026 |
| Platform administrator | admin@membrr.local | MembrrDemo!2026 |

These accounts and their members are synthetic. Seeding is explicitly restricted to local development and never overwrites existing demo data. Production must use a fresh database. Use synthetic recipients for testing; an ordinary WhatsApp link opens a real chat if you choose to open it. New local databases use UTF-8 for ₹ and Indian-language text.

## Member QR attendance

1. Open a member profile and choose **Member QR**. Owners and staff can issue or retrieve the member's card.
2. Choose **Download QR** to save a PNG for the member's phone, or **Print card** for a card with the business name, member name and member ID. Share or hand over the card yourself.
3. At reception, signed-in staff open **Attendance → Scan member QR → Start camera**. The scanner prefers the rear camera. **Choose QR image** also reads a saved PNG, JPG or WebP up to 10 MB, without uploading the image.
4. Check the displayed name against the person at reception and choose **Confirm check-in**. Scanning alone does not record attendance.

Attendance remains once per member per day in Asia/Kolkata. The server rechecks active membership at confirmation and rejects archived, expired, upcoming or cancelled memberships. A repeat scan shows **Already checked in today**; concurrent QR/manual check-ins cannot create duplicate entries. QR entries are labelled in today's attendance and retain the staff user's ID.

Camera access requires permission and a secure context: HTTPS on a deployed site, or localhost on the same computer. A plain HTTP LAN address on a phone will not enable the camera. This is an in-app staff scanner; the QR is an opaque membrr identifier, not a public self-check-in URL. It contains no name or phone number. Card viewing and scanning both require staff access to the correct active business. Staff still need to verify who is presenting a copied card.

Owners can choose **Replace lost QR** on the member card. Confirming immediately invalidates the old QR; give the member the replacement. Renewals keep the same QR. Tokens are stored hashed for lookup and encrypted for card retrieval, using the existing `CREDENTIAL_ENCRYPTION_KEY`, and are included in database backups. Existing attendance records default to the staff/manual source when the migration runs.

Run `npm run test:qr` for database checks and `npm run test:e2e` for card generation, real QR-image decoding, simulated camera frames, confirmation, duplicates, camera cleanup and replacement. A physical phone-camera check on the HTTPS deployment is still required before the pilot.

## Manual WhatsApp workflow

1. Open **WhatsApp** to see upcoming/recent expiries and due or overdue fees, or open a member profile and choose **WhatsApp**.
2. Choose **Prepare reminder**. Current membership dates and unpaid balances fill the message; edit the text as needed.
3. Optionally upload an image or document in **Images & documents**, or select a reusable file link. The recipient preview includes the filename and download link.
4. Click **Open WhatsApp** or **Copy message**. Review the chat and press Send in WhatsApp yourself.
5. Back in membrr, tick **I sent this message in WhatsApp** and choose **Record as sent manually**. Opening/copying a message never records it as sent.

Owners can prepare a free-form announcement for an audience or search for individual recipients. Open each chosen chat yourself; there is no automatic bulk sending. Announcements support `{name}` and `{business}` placeholders. Messages are limited to 2,000 characters; audiences are paginated in groups of 50, with shared numbers shown once per page.

WhatsApp messages are available by default for new, imported, and existing contacts. Member forms no longer require consent checkboxes or a consent record, and member profiles have no **Stop WhatsApp** control. Existing opt-outs still block the phone number, including shared family numbers, and imports and edits preserve them. Normal WhatsApp cannot send inbound replies back to this dashboard. History means a staff member confirmed sending; it is not a delivery/read receipt. A follow-up stays visible until its membership or balance changes, so check history before sending another nudge.

### Image and document links

Upload JPG/JPEG, PNG, WebP, PDF, or Word `.docx` files, up to 10 MiB each. Older `.doc` files must first be saved as `.docx` or PDF. Select up to three files per message. The 2,000-character limit includes file names and links after personalisation. Uploading, opening a file, and selecting a link never sends a WhatsApp message.

Links use a random 256-bit token and allow anyone holding the link to download, without a member login. They expire 30 days after upload. Owners manage all links for their business; staff manage only their own uploads. **Revoke link** immediately disables all shared copies and removes the stored content, while preserving upload/revocation audit history. It cannot remove downloads already saved on a recipient's device. Suspended businesses' links are unavailable.

File bytes and metadata are stored in PostgreSQL and included in the existing encrypted database backup/restore workflow. There is no separate upload folder or storage service to configure. Pilot limits are 100 MiB and 50 active files per business, with 20 uploads per hour. Quota checks are serialized for simultaneous uploads. Expired files stop downloading immediately; their stored bytes are reclaimed on that business's next successful upload. Metadata remains for auditing. Backup retention still applies to previously backed-up files.

`BETTER_AUTH_URL` must be the app's canonical public HTTPS origin in production. Docker Compose already sets it from `APP_DOMAIN`. Links generated at `localhost` work only on the computer running the app; the composer labels this as a local preview. Use a publicly reachable deployment before sharing with members. After changing domains, reuse the library to copy links with the new origin; messages already sent retain their original URL. Uploads use authenticated, same-origin endpoints with streamed size limits and file-signature checks. Downloads are served as attachments with no-store, noindex and restrictive content headers; signature checks are not a malware scan.

Run `npm run test:files` for file isolation, lifecycle and concurrent quota tests, and `npm run test:e2e` for upload → public download → WhatsApp preview/history → revoke. The backup drill includes a synthetic uploaded image and verifies file bytes and share metadata after restoration.

On this machine, the original Windows-encoded local database was copied to `clubhouse_utf8`, verified across all application tables, and `.env` updated to use the copy. The original database remains available for recovery. `scripts/upgrade-local-encoding.ts` supports this local-only migration without overwriting either database.

## Business logos

Owners can open **Settings → Business logo**, choose a PNG, JPG, or WebP image up to 2 MB, preview it, and choose **Save logo**. **Change logo** replaces it; **Remove logo** restores the default icon. Saved logos appear in the workspace sidebar and on payment receipts, including printed receipts.

Images are validated, resized to fit 1024 × 1024 pixels, and stored in PostgreSQL as WebP with metadata removed. Logo data is included in database backups. Owners manage their own business's logo; signed-in staff can view it. Apply the migration with `npm run db:migrate`, generate the client, and rebuild/restart for deployment.

## Business billing with Razorpay

Platform administrators can charge each business a configurable monthly INR fee. In **Platform admin → Configure billing**, enter the full monthly amount (including any applicable taxes). Leave it blank to disable billing. Owners open **Business billing** and choose **Pay … for one month**. Each renewal is a separate Razorpay Standard Checkout payment; there is no automatic debit or Razorpay subscription mandate.

Setup:

1. Apply migrations (`npm run db:migrate`) and generate the client (`npm run db:generate`), then rebuild/restart the app. Existing businesses start with billing disabled.
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and an independent `RAZORPAY_WEBHOOK_SECRET` on the server. Start with Razorpay **Test Mode** keys and a synthetic business in a local/staging database. Secrets must never have a `NEXT_PUBLIC_` prefix. The public key ID is returned with the authenticated checkout order.
3. In the Razorpay Dashboard, enable **automatic capture**. Add a webhook at `https://your-domain/api/webhooks/razorpay`, set the same webhook secret, and subscribe to **payment.captured** and **order.paid**. Localhost requires a public HTTPS tunnel for webhook delivery. `BETTER_AUTH_URL` must match the origin used to open the app.
4. Set the business fee in admin. Sign in as that business's owner and complete a test checkout. Confirm its payment is **captured**, the paid-through date updates, a billing-history row appears, and the webhook receives HTTP 200. Also test closing the browser after payment and duplicate webhook delivery. **Check payment status** recovers payment confirmation when the callback is lost or capture is delayed.
5. After successful Test Mode verification, configure Live Mode keys and a Live Mode webhook on the production deployment. Test payments are visibly labelled and also update the synthetic business's dates; use a separate staging database so test credits are never production entitlements. Verify one authorized live payment and settlement in your Razorpay account before onboarding paying businesses.

Prices come exclusively from the saved business fee. Orders retain the amount and key ID quoted when they were created; a later fee change applies to new orders. Repeated checkout opens reuse an unpaid order at the same price and key. The server verifies the callback HMAC against its stored order ID, fetches the payment, and checks the order, amount, currency and captured state. Webhooks authenticate the exact raw body with their own secret. Browser callbacks, status checks, and repeated webhook events settle under a business row lock, so one payment credits one calendar month exactly once. Uncaptured, failed, mismatched or refunded payments do not receive a new credit.

Paid periods use inclusive Asia/Kolkata dates and the same calendar-month rules as memberships. Early renewal extends the current paid period; a lapsed business starts its next month on the confirmation date, without billing arrears. Billing is separate from member payments, charges and attendance. Overdue billing is visible to admins and owners; it does **not** automatically suspend a workspace. Existing administrative suspensions remain in force after payment. Staff and support sessions cannot pay.

Refunds and disputes are managed in the Razorpay Dashboard. Refunds made after a month was credited do not automatically shorten that period; review access manually. Changing or disabling a fee does not cancel an already-open Razorpay order, whose successful payment still receives its quoted month. Keep old keys/webhook secrets until outstanding payments and webhook retries are reconciled; the app refuses browser verification/status checks for orders created with a different API key. Failed webhook processing returns a non-2xx status for provider retry. Monitor webhook failures in the Razorpay Dashboard.

Run `npm run test:billing` for real database tests with a simulated Razorpay transport (no money moves). This covers owner/tenant isolation, fee validation, concurrent order reuse, signatures, amount/currency/capture checks, duplicate callbacks/webhooks, renewal periods, recovery, and suspension preservation. `npm test` includes signature and request-boundary tests. These checks do not replace a real Razorpay Test Mode checkout with your account credentials.

References: [Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [webhook validation and retries](https://razorpay.com/docs/webhooks/validate-test/).

## Application structure

The workspace **Reports** page provides member lists, daily/weekly/monthly
collections, outstanding dues with ageing, renewals and attendance. Owners can
export all filtered results to CSV. See [Reports](docs/reports.md) for date,
accounting and access rules. No additional migration is needed for reports.

`src/app` contains authenticated pages, server actions, and auth/webhook/health/export endpoints. `src/lib` contains business-scoped operations and messaging rules. `src/worker.ts` runs only for optional cloud messaging. `ManualSend` stores user-confirmed manual history separately from API delivery records. `prisma` contains the schema and deployable migrations. `ops` contains hosting and recovery tooling.

All mutations obtain identity/business access on the server. Tenant services recheck current staff access and active business status. Tenant relationships use composite business/record references. Financial writes lock the affected charge; duplicate request keys prevent duplicate payments. There is no public customer API.

## Membership and messaging behavior

### Taxes, discounts and admission fees

Owners configure **Plans → New plan / Edit plan** with a membership fee, optional admission fee, tax percentage, and whether tax is added or already included. Existing plans start with no admission fee and 0% tax. The displayed per-term price includes tax and excludes the one-time admission fee.

When starting a member's first membership, the admission fee is selected by default and staff can skip it. Renewals never add it again, including after a cancelled first term. Owners and staff can apply a fixed rupee or percentage discount with a reason. Discounts apply to the membership plus admission subtotal; tax is then added or extracted from the discounted amount. Both fees use the plan's tax rate and treatment. Amounts and percentages accept up to two decimal places; calculations round to the nearest paise. A 100% discount creates a zero-value charge with no payment required.

The form previews the complete charge. The server calculates it again from the saved plan and rejects a changed total for review. Charge details and payment receipts retain the original membership fee, admission fee, discount, tax rate and tax amount after plan edits. Partial payments, outstanding balances, reversals and waivers use the final charge total. Receipts show the full charge breakdown separately from the individual payment; they remain payment acknowledgements, not GST tax invoices.

Apply `npm run db:migrate`, regenerate the Prisma client, and rebuild/restart when deploying. The migration preserves historical charges and payments. Run `npm run test:member-billing` for local database checks, `npm test` for calculation tests, and `npx playwright test e2e/member-billing.spec.ts` against a running app for the plan → membership → payment → receipt → renewal flow.

- Monetary values are integer paise; all display dates and reminder schedules use Asia/Kolkata.
- Membership end dates are inclusive. A one-month term from 2 October ends on 1 November. Calendar-month additions clamp to the last available day, then subtract one day: 31 January 2026 ends on 27 February. Staff can explicitly review/adjust dates before activation.
- Active renewals begin the next day after the current term. Expired renewals default to today. Overlapping terms are rejected. Payment never activates or renews membership automatically.
- Cancelling a term stops access/renewal reminders and retains unpaid charges. Owners may waive a charge after reversing any net payments; this is an accounting correction, not an online refund.
- Attendance is recorded once per member per local day, for active memberships only.
- CSV headers: `name,phone,email,notes`. Up to 2,000 rows / 2 MB per import. Preview rejects invalid/duplicate rows; existing matching name + phone rows are skipped without overwriting opt-outs. Shared family numbers share a contact/opt-out record. CSV exports escape spreadsheet formula prefixes.

## Optional cloud messaging (disabled)

The following behavior applies only when `WHATSAPP_MODE=cloud`. Manual mode blocks API sends and scheduling at the server boundary, including previously queued jobs. Existing cloud data is retained; review pending campaigns before choosing to enable cloud mode later.

- Renewal defaults: 7, 3 and 0 days before expiry. Dues defaults: 1 and 7 days after the charge due date. Default send time: 10 a.m. IST. A durable minute tick schedules due work and deduplicates each term/charge/day.
- Delivery uses one exclusive pg-boss batch per business, bounded to 45 seconds, with up to 10 businesses processed concurrently. The batch waits for each sender's database-enforced rate limit so a throttled message can proceed within the same minute.
- Immediately before sending, the worker rechecks business/member status, opt-outs, the current phone, template status, renewals, cancellation and outstanding balances. Overdue reminder jobs from an earlier local day are suppressed to avoid stale reminders; campaigns retain their scheduled intent.
- Definitive rate-limit rejections use bounded backoff. Timeouts, ambiguous provider responses or interrupted in-flight requests become **UNKNOWN** and are never blindly retried. Signed delivery callbacks may reconcile these later. Review remaining unknowns in Meta before arranging any manual resend.
- Templates support text with positional body variables. Media, buttons and named variables are not supported in this release. Map `name,business,expiry,amount,due,date` in Settings. Expiry/amount/due are populated for their respective automatic reminders.
- The shared chat inbox is out of scope. Inbound STOP/UNSUBSCRIBE/OPT OUT/CANCEL and the supported Hindi opt-out keyword stop messages and suppress queued jobs for that phone number.

## Deploy to a Linux VPS

Start with 2 vCPU / 4 GB RAM, then measure the actual workload. Install Docker Engine with Compose and point a domain at the server. Expose web ports 80/443 and restrict SSH to trusted access; keep PostgreSQL private.

1. Copy `.env.example` to `.env`. Keep `WHATSAPP_MODE=manual`. Set a random hex `POSTGRES_PASSWORD`, a random `BETTER_AUTH_SECRET` of at least 32 characters, and an independent 64-hex-character `CREDENTIAL_ENCRYPTION_KEY`. The encryption key is required for reusable file links even in manual mode; save it separately for recovery. Set `APP_DOMAIN`, `BETTER_AUTH_URL=https://your-domain`, SMTP settings and a valid `SMTP_FROM`. Meta variables are not needed in manual mode. Set `ALLOW_LOCAL_EMAIL_LOG=false` for production.
2. Use a fresh UTF-8 production database, never the seeded local cluster.
3. Run `docker compose up -d --build`. The migration container must complete before the web server starts. Caddy obtains HTTPS certificates. The messaging worker is excluded by default.
4. Create a platform admin with `docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_NAME migrate npm run bootstrap`, supplying those environment variables securely. Use at least a 16-character password and remove it from your environment afterward.
5. Sign in as admin and create a business with its name and city. The creating admin receives owner access and the workspace opens immediately with a three-day trial and ₹499 monthly fee. Use **Open workspace** to switch between businesses you own. Invitations are optional under **Settings**; configure SMTP before sending them.
6. Sign into WhatsApp on the device used for manual messaging, then prepare a message in membrr. No Meta setup is required.
7. Configure backups and monitoring below, then pilot with two businesses before expanding.

If cloud messaging is explicitly adopted later, configure Meta's callback at `https://your-domain/api/webhooks/whatsapp`, the app secret and verification token, and a 64-hex-character credential encryption key. Complete Meta permissions, connect and verify each business sender, and sync approved templates. Back up the credential encryption key separately. Set `WHATSAPP_MODE=cloud` and start the worker with `docker compose --profile cloud-messaging up -d --build`. Keep `WHATSAPP_DRY_RUN=true` until a consenting live test is planned; this records SIMULATED, not sent/delivered. Demo connections cannot send live messages.

The Linux Docker build itself requires verification on a Docker-capable host; Docker is not installed in the implementation environment. The app is now deployed on [Azure App Service](https://pep-b5f5axg9fjgucsg8.centralindia-01.azurewebsites.net), with production migrations applied and Google sign-in reaching Google's login screen. The user must complete the first Google login; live Meta/SMTP operation remains unverified. See [the verification record](docs/VERIFICATION.md).

For DigitalOcean Droplets, outbound SMTP ports 25, 465 and 587 are blocked according to the provider's [limits documentation](https://docs.digitalocean.com/products/droplets/details/limits/). Choose an email provider that supports an available alternative such as port 2525, and set `SMTP_PORT` accordingly. Verify invitation and password-reset delivery before onboarding businesses; this app currently sends account emails through SMTP.

## Backups, recovery and monitoring

The `backups` profile uses `pg_dump` and restic to encrypt a database snapshot into an **off-site** S3-compatible repository. Copy `.env.backup.example` to `.env.backup`; set the repository, repository password and scoped storage credentials. Save the repository password separately. Initialize it once:

```sh
docker compose --profile backups run --rm --entrypoint restic backup init
docker compose --profile backups up -d backup
docker compose --profile backups run --rm --entrypoint backup.sh backup
```

Automatic backups run at 02:00 IST. Keep the most recent 30 days of snapshots. Configure `BACKUP_HEALTHCHECK_URL` with an external service that alerts on both failed and missed daily pings; a server outage cannot report its own failure. A successful backup updates the admin health record.

For a recovery drill, restore into a **new, isolated database**:

```sh
docker compose --profile backups run --rm -e RESTORE_DATABASE=clubhouse_restore_drill --entrypoint restore.sh backup
```

The script refuses the production/default database names and fails if the requested database already exists. Inspect membership counts, payment totals, manual message history and migration history before directing any application at a restore. The drill never switches the app's connection automatically. If cloud messaging is adopted later, keep automatic sending disabled after a restore until restored queued/processing messages have been reconciled against Meta.

`/api/health` checks PostgreSQL; in manual mode it reports `worker: not_required`. In cloud mode it also checks the worker heartbeat and returns 503 when degraded. Configure `MONITOR_HEALTHCHECK_URL` with an external dead-man switch and run `docker compose --profile monitoring up -d monitor` for availability monitoring. Cloud mode can send hourly-throttled backlog alerts to `ALERT_EMAIL`. External monitor and off-site storage delivery must be verified with your own services.

## Checks

```sh
npm run typecheck
npm test
npm run test:qr
npm run test:integration
npm run test:manual
npm run test:worker
npm run test:e2e
npm run test:load
npm run test:backup
npm run build
npm audit
```

Integration/load fixtures run only against a local database and remove only their explicitly named test workspaces. Browser tests require the app on localhost:3000 and Chrome; `E2E_BASE_URL` can change the app address. The backup drill requires `RESTIC_BINARY` and `PG_BIN` (the local Windows defaults match the verified development tools). It exercises real `pg_dump`, encrypted restic backup, repository integrity checks, wrong-password rejection and `pg_restore` into a new database. It uses a local test repository; it does not validate remote storage access.

Pause any cloud worker while running integration and worker fixtures so it cannot consume test messages. Those scripts opt into cloud mode only inside their test process and use a fake sender. Run load and backup drills separately from other database-mutating tests. Leave the messaging worker stopped for normal manual use.

Test output and screenshots are under ignored `artifacts/` and `test-results/`. Read `docs/VERIFICATION.md` for the latest recorded results.

## Deferred

Court/turf bookings, multiple branches, member self-service, online member payments, freezes, trainers/classes, shared WhatsApp inbox, and automatic recurring SaaS charges.

## Signup, free trial, and paid access

New owners can register at `/signup`. Signup creates their account, workspace,
main branch, and owner access in one transaction. The workspace includes all
features for exactly 72 hours from account creation, followed by a ₹499/month
workspace plan using the existing Razorpay checkout. No card is required for the
trial, and payment is not collected automatically.

After expiry, feature pages redirect to `/upgrade`; feature services and APIs
also enforce the restriction. Owners retain access to `/billing` to pay or check
an earlier payment. A verified captured payment restores features through the
paid billing date (inclusive in IST). Staff share their workspace's access and
must ask an owner to pay. Inviting another user never resets the trial. Admin
created workspaces start their trial immediately. Older invitation-only workspaces
start it when their first invited owner creates an account. Existing workspaces
keep their access when the migration is applied.

Google signup is available on `/signup` when both Google credentials are configured.
After Google verifies a new account, `/onboarding` collects workspace name and city.
The trial starts at account creation, and repeated setup cannot create additional
workspaces or extend it. Returning Google users retain their workspace and role;
new Google accounts never receive platform administrator privileges.

Apply `npm run db:migrate` before running the updated app. Configure the existing
Razorpay variables for online payments; platform admins can override a workspace's
monthly fee using the existing billing settings. Signup uses a bounded request
body, origin validation, and a limit of five attempts per IP per hour.
