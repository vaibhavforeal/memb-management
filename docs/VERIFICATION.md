# Verification record

Verified locally on 2–3 October 2026 using Windows, Node.js 24, PostgreSQL 18.4, and Chrome. The web application runs as a Next.js standalone production server. The local database contains synthetic demo data. The current release uses **manual WhatsApp** and does not require a messaging worker.

## Report export and health-check review fixes — 6 October 2026

- Report CSV exports now read every page from one RepeatableRead snapshot and record `REPORT_EXPORTED` before any data is sent, so concurrent edits cannot duplicate or drop rows and aborted downloads are still audited. An expired plan during export returns HTTP 402 rather than a truncated download. `period=next-30` is accepted only for renewals. The member-list report reuses the directory's search and plan filters, and timestamp columns use a `datetime` kind for their IST day in CSV.
- `/api/health` checks the connection's current schema, limits the catalog query to the application's tables, reuses a passing schema check for five minutes (failures are never cached), logs failures, and sends `Cache-Control: no-store` on every response.
- TypeScript, all 104 unit tests, the local production build, and the real PostgreSQL report and member-directory tests passed. The new schema query found all thirty tables with no missing columns locally, and the local health endpoint returned HTTP 200 with the cached path responding in about 20 ms. The HTTP 402 export path was not exercised with an expired-plan session.
- Azure deployment `15ddd116-453c-459d-bb23-123a5fbd736d` reached `RuntimeSuccessful` with one successful instance and no failures; the Oryx build summary reported no errors. Live health returns HTTP 200 with `database: up`, `schema: ready`, and the new `Cache-Control: no-store` header, confirming the new code is running. No migration or configuration change was needed; the bundle's twelve migrations match production. Deployed file hashes were not compared.
- Observed but unchanged: the App Service startup command is blank, Always On is off, and no Health Check path is set, although the deployment guide recommends all three.

## Production schema repair and readiness check — 5 October 2026

- Investigated the server error after the reports release. Production had only eight migrations applied, while the deployed shared workspace/profile/billing code required twelve. `BusinessLogo` and `MemberPhoto` were absent, along with fourteen business, plan and charge columns. The old `/api/health` used only `SELECT 1`, so it incorrectly passed despite the incompatible schema. The earlier statement that no migration was needed did not account for other changes included in the source bundle.
- Compared the four pending migration SQL files against local SHA-256 hashes, reviewed their additive changes, and applied them with Prisma's `migrate deploy` from a temporary Azure maintenance installation. All twelve migrations are now applied. No existing member or payment records were removed or reset.
- Verified every required column across all thirty Prisma models from inside Azure using a read-only database transaction. All model projections and the workspace access/business-logo join passed. No production member records or credentials were emitted during verification.
- The health endpoint now checks database metadata against the deployed Prisma client. It returns HTTP 503 with `schema: outdated` for missing tables or columns, and `schema: ready` on success. The public response does not list database objects or expose customer data. Updated deployment instructions require reviewing all pending migrations for every source release.
- TypeScript and all 102 unit tests passed, including three schema-readiness regressions. The updated handler returned HTTP 200 with `schema: ready` locally. Azure deployment `c87edea3-0a5c-48b8-850c-fc4cc2cc3252` built successfully and reached `RuntimeSuccessful` with one successful instance and no failures. Both changed application files match deployed SHA-256 hashes. Live health returns HTTP 200 with `database: up`, `schema: ready`, and manual messaging. The user's authenticated browser session was not available; verification covered production database queries and the live readiness endpoint.

## Reports deployment — 4 October 2026

- Added member lists, daily/weekly/monthly collections, outstanding dues with ageing, renewal follow-ups, and attendance reports. Filters, whole-report totals, pagination, and owner-only CSV downloads share business-scoped queries. Collections include reversals by recorded IST date; current dues retain debts from archived members and cancelled terms and exclude waived charges.
- The local production build, TypeScript and formatting checks passed. All 99 unit tests passed. Real PostgreSQL tests covered date boundaries, grouping, reversals, ageing, renewals, attendance, exports spanning more than 500 rows, tenant isolation and expired access. The production browser test passed for all five reports, filtering, downloads, invalid dates, desktop/mobile layouts, anonymous access and staff export restrictions.
- Azure deployment `728ea6ab-88a1-469d-9817-87c10478b4b4` completed with `RuntimeSuccessful`, one successful instance and no failures. Azure's Linux build passed. All nine changed deployment files (package manifest, report modules/routes/components, shared directory module and navigation) matched local SHA-256 hashes.
- The live health endpoint returned HTTP 200 with `status: healthy`, `database: up`, `worker: not_required` and `messaging: manual`. An unauthenticated visit to `/reports` correctly reached sign-in. Authenticated report flows were verified locally against the production build; no production member records were created for this deployment check. No schema migration or configuration change was required.
- Screenshots: `artifacts/reports-members-desktop.png`, `artifacts/reports-collections-desktop.png`, `artifacts/reports-outstanding-desktop.png`, and `artifacts/reports-mobile.png`. Usage and accounting rules: [Reports](reports.md).

## Member profile WhatsApp control removed — 4 October 2026

- Removed the **Stop WhatsApp** button from member profiles and its unused server action. WhatsApp remains enabled by default; existing opt-out records and inbound STOP processing are preserved.
- The production build and targeted manual WhatsApp browser test passed. The test verified that the control is absent, the editable message link and manual history work, and an existing opt-out still blocks the composer. No real messages were sent. Screenshot inspected: `artifacts/member-whatsapp-profile.png`.
- Azure deployment `c26e9875-6daa-4d8f-959d-008ee28bb7c1` completed with `RuntimeSuccessful`, one successful instance, and no failures. Both changed application files match deployed source by SHA-256. The live health endpoint returned HTTP 200 with `database: up` and manual messaging. No migration or configuration change was needed.

## WhatsApp enabled by default — 4 October 2026

- Removed WhatsApp consent checkboxes and consent-record entry from member forms, consent-only campaign helper text, and consent requirements from manual messaging, campaign previews, reminder scheduling, and delivery checks. Member profiles now show **WhatsApp enabled** unless that contact has opted out.
- New, imported, and existing contacts can use WhatsApp by default. **Stop WhatsApp** and inbound STOP/UNSUBSCRIBE/OPT OUT/CANCEL requests remain effective. Editing a member or importing another family member with the same number preserves that phone's opt-out.
- Historical consent columns remain as historical records; they are no longer used to determine messaging eligibility. No consent was fabricated, no contact backfill was performed, and no schema migration was required. Production continues to use manual WhatsApp sending.
- The production build and all 65 unit tests passed. Manual messaging integration verified default eligibility, imports, shared numbers, edits, and opt-outs. All 24 PostgreSQL integration scenarios passed, including cloud reminder eligibility and STOP suppression using simulated senders. Two browser tests verified member creation without consent fields, default WhatsApp access, and the Stop WhatsApp action. The form screenshot was captured after the form loaded: `artifacts/member-form-default-whatsapp.png`.
- Azure deployment `fb20a774-7a1d-4e42-9beb-6e7113b0bf64` completed with `RuntimeSuccessful`, one successful instance, and no failures. All eight changed application files match deployed source by SHA-256. The live health endpoint returned HTTP 200 with `database: up` and manual messaging.

## Public Google signup — 4 October 2026

- Added **Continue with Google** to signup and enabled new Google accounts. New users complete workspace name and city at `/onboarding`; existing users retain their workspace and role. Interrupted setup resumes after sign-in.
- Setup requires a signed-in, verified Google identity and creates the workspace, branch, owner access, and audit record atomically. A per-user database lock and existing-access check prevent duplicate workspaces. The three-day trial starts at account creation, costs ₹499/month afterward, and cannot restart through repeated setup.
- The production build and TypeScript checks passed. All 65 unit tests passed across the suite and focused rerun, including ten OAuth tests for signup, linking, encrypted tokens, state, and cancellation. Two browser tests used Google token/profile simulation confined to the local test process and verified the real session, setup page, database records, returning-user behavior, duplicate setup, expiry, and rejected unverified identities. Temporary accounts and workspaces were removed.
- Azure deployment `5f0e175e-dd60-49c3-b3fd-dfce6a79abe7` completed with `RuntimeSuccessful`, one successful instance, and no failures. All ten changed application files match deployed source by SHA-256. `/api/health` returned HTTP 200 with `database: up`. No migration or credential changes were required.
- The live signup page displays the Google button, and clicking it reaches Google's sign-in screen. Actual Google account login, consent, and the live token exchange remain for the user to complete. Screenshots: `artifacts/google-signup-live.png`, `artifacts/google-signup-provider.png`, and `artifacts/google-workspace-setup.png`.

## Admin workspace creation without invitations — 4 October 2026

- Admin business creation now requires only business name and city. One atomic write creates the workspace, branch, creating administrator's owner access, and audit entry. No invitation or email is created. New workspaces start a 72-hour trial at ₹499/month.
- Creation opens the new workspace immediately. Admins can return through the **Platform admin** link and use **Open workspace** to select another business they own. Selection is checked against that user's access on every request; other businesses still require the existing audited support flow.
- The local production build and all 63 unit tests passed. Browser tests verified two workspace creations, switching back to the first, zero invitations, trial and fee values, rejected unauthorized creation/selection, and preserved isolation for an administrator with no owned workspace. Temporary test accounts and workspaces were removed.
- Azure deployment `ceb51963-43a6-47db-97e9-83a8f03d5e1e` completed with `RuntimeSuccessful`, one successful instance, and no failures. All six changed application files were compared by SHA-256 with deployed source. The live health endpoint returned HTTP 200 with `database: up`. No schema migration was required. Screenshot: `artifacts/admin-create-workspace.png`.

## Public signup, trials, and UI cleanup deployment — 4 October 2026

- Deployed the current source ZIP to the existing Azure `pep` app. Deployment `362f6cfa-df42-49de-90f9-58d32090d16c` completed with `RuntimeSuccessful`, one successful instance, and no failed instances. Azure's Linux production build passed.
- Applied `202610040001_signup_trial` before deployment. All eight migrations are applied; existing workspaces retain access, and new workspaces default to requiring a trial or payment.
- Verified public signup in the live HTTPS browser without an invitation. The new owner signed in automatically and reached the dashboard. A database check confirmed a 72-hour trial and a monthly fee of 49,900 paise.
- Expired only that temporary workspace's trial and confirmed `/members` redirects to `/upgrade`. The paid-plan link opens billing and shows ₹499/month. Signed out and removed the temporary account and workspace after verification.
- Confirmed the simplified live login and signup copy, no browser errors during the flow, and HTTP 200 from `/api/health` with `database: up`. Screenshots: `artifacts/azure-login-live.png`, `artifacts/azure-signup-live.png`, and `artifacts/azure-trial-expired-live.png`.
- Production Razorpay credentials are absent. Checkout remains disabled with a setup message until `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` are configured. No live payment was attempted.

## Azure deployment and Google sign-in — 4 October 2026

- Deployed the updated source ZIP to the existing Azure `pep` application. Deployment `48ef080f-09a4-4651-8b9c-3118efe2888d` completed with `RuntimeSuccessful` and no failed instances.
- The live `/api/health` returned HTTP 200 with `status: healthy`, `database: up`, and manual messaging. This endpoint checks database connectivity, not schema initialization; the first Google sign-in attempt failed because production contained no application tables.
- Applied all seven existing Prisma migrations to that empty production database. No development seed data was loaded. Provisioned the user-designated first administrator for Google sign-in after confirming the user table was empty.
- The deployed login page renders **Continue with Google** alongside the password form. Clicking it reaches Google's sign-in screen. The user must complete their own Google login before the real token exchange, callback, and administrator session can be verified.
- Eight isolated authentication tests, TypeScript checks, and the local production build passed before upload. Desktop/mobile browser checks confirmed rendering and password fallback on a simulated Google connection failure. SMTP and real invitation delivery remain unverified.

## Staff-scanned member QR attendance — 3 October 2026

- Added individual member QR cards with PNG download and an authenticated printable card. Owners/staff issue or retrieve cards from the member profile; owners can replace a lost card and immediately invalidate the old token. QR contents contain only an opaque random identifier. Card tokens are encrypted at rest and hashed for lookup; they do not grant access to member pages.
- Attendance supports camera scanning and local PNG/JPG/WebP decoding. Staff review the matched name and explicitly confirm check-in. Server operations verify current staff/business access, card validity and active membership. Check-ins record the staff user and QR source, with the existing business/member/IST-day unique constraint preventing duplicates with manual check-ins.
- Applied the additive MemberQr and Checkin source migrations. Existing attendance defaults to STAFF. QR rows have composite business/member relations and a unique token hash. No public check-in endpoint or member account was introduced.
- Production build and TypeScript passed; all **40 unit tests** passed. Decoder coverage includes 40 deterministic QR patterns and rotated cards. The initial decoder occasionally missed valid generated patterns; it was replaced with jsQR, which also decoded the captured failing fixture. The scanner loads its decoder only when used.
- `npm run test:qr` passed: concurrent/idempotent card issuance, scoped access, malformed QR data, preview without attendance, concurrent QR/manual duplicates, recorded staff/source, expiry-day inclusion, expired/future/cancelled/archived memberships, owner-only replacement, stale QR rejection, changed staff access and suspended businesses. Test businesses were cleaned up.
- All **10 browser scenarios** passed on the final production build. QR coverage includes card generation/download metadata, printable view, unauthenticated access rejection, staff image scanning, explicit confirmation, repeat scans, unrelated/unreadable QR images, denied camera permission, actual decoding of simulated camera frames, stopping media tracks after detection and dialog closure, and replacing/rejecting the old card. Existing payment/receipt/attendance, directory/profile, access, manual WhatsApp and shared-file journeys also passed.
- Desktop/mobile QR and scanner screenshots were inspected at 1,440 px and 390 px: `artifacts/member-qr-mobile.png`, `artifacts/attendance-qr-mobile.png`, `artifacts/attendance-qr-desktop.png`. Browser tests used synthetic members and video streams; no physical camera, printer or real member card was used. Test a real phone camera on the HTTPS deployment before pilot use. Camera access requires permission and HTTPS, with localhost allowed for local testing.

## Member directory and profile tabs — 3 October 2026

- Added compact All, Active, Expiring, Expired and Unpaid tabs with counts; search, plan and fee filters; name/joined/expiry sorting; and filtered owner CSV exports. Filter counts use the same business-scoped query as the directory. Current memberships take precedence over future early renewals.
- Member profiles now group the existing operations into Memberships, Payments, Attendance, WhatsApp and Notes. Direct tab URLs, keyboard navigation, browser Back, and unsaved membership dates survive tab switches. Payment and receipt links open the Payments tab. Manual message history records staff confirmations only.
- Production build and TypeScript checks passed; all 38 unit tests passed. `npm run test:directory` passed against isolated PostgreSQL fixtures: expiry boundaries, current/future/cancelled terms, plan/fee combinations, partial payments/reversals/waivers, stable sorting, pagination, filtered export, literal search characters, malformed parameters, business isolation and suspension.
- All nine browser scenarios passed on the rebuilt production server, including the full member/payment/receipt/check-in journey, owner/staff/admin permissions, filtered export restrictions, manual WhatsApp and file links. The new directory/profile scenario also passed after screenshot synchronization was tightened. Desktop (1,440 px) and mobile (390 px) screenshots were inspected. A screen-reader label escaping its table caused mobile page overflow; positioning its header cell fixed the cause while retaining table scrolling.
- The isolated 10,000-member run measured dashboard reporting at **284 ms**, paginated search at **82 ms**, and the new directory's counts plus plan/unpaid filtering and expiry sorting at **384 ms**. Fixture creation took 18,362 ms; inserting 10,000 suppressed message records took 5,603 ms. Results are in `artifacts/load-test.json`; all performance thresholds passed on that run, and fixtures were cleaned up.
- The preceding load run recorded a 22,766 ms dashboard result and stopped before measuring the directory. No dashboard code was changed, and the cause of that timing variance was not established. The load script now writes every measurement before checking performance thresholds. These are local measurements, not a concurrent-user test or a VPS capacity guarantee.

Screenshots: `artifacts/member-directory-1440.png`, `artifacts/member-directory-390.png`, `artifacts/member-profile-1440.png` and `artifacts/member-profile-390.png`. No schema migration was required. The app remains available at `http://localhost:3000/members`; production deployment and the existing pilot prerequisites below remain separate work.

## Compact layout — 3 October 2026

- Further compacted Membership plans into a single list of rows, removing decorative icons and repeated feature descriptions. Desktop rows measured 67–68 px; owner rows on a 390 px phone measured 115–116 px with wrapped actions. Both owner and staff layouts had no horizontal overflow or browser errors. Verified the owner create dialog, existing edit values, and that staff have no edit controls; production build/TypeScript passed. Screenshots: `artifacts/plans-rows-1440.png` and `artifacts/plans-rows-390.png`.
- Reduced spacing across the workspace, platform admin, shared forms/dialogs, table rows, navigation, cards and WhatsApp composer. Main text sizes remain readable; normal inputs/buttons keep their 40 px mobile height and use 36 px on desktop.
- Measured on the same 1,258 px desktop viewport: workspace padding decreased from 32 px to 20 px, header height from 70 px to 56 px, and member row height from 69.5 px to 57.5 px. Table cell padding is now 9 px vertically and 12 px horizontally. The message textarea minimum height decreased from 208 px to 128 px.
- Final production build and TypeScript checks passed. All eight existing browser scenarios passed on the rebuilt server, including payments/receipt/attendance, owner/staff/admin access, mobile navigation, manual WhatsApp and file-link upload/revocation.
- Additional read-only browser checks covered dashboard, new-member form, import, message composer, settings and admin at 1,440 px and 390 px. No page errors or horizontal overflow occurred. Desktop/mobile screenshots and the business-creation dialog were inspected; captures use the `artifacts/compact-*` prefix.

## Image and document links — 3 October 2026

- Production build, TypeScript and all 38 unit tests passed. New cases cover PNG/PDF/DOCX detection, disguised/unsupported files, filenames, upload size enforcement even without an honest Content-Length, URL configuration, and WhatsApp link encoding.
- `npm run test:files` passed against PostgreSQL: exact downloaded bytes, tenant/staff isolation, unknown tokens, owner revocation, idempotent revoke auditing, suspended businesses, expiry, expired-byte cleanup, changed staff access, and simultaneous uploads at the 50-file cap.
- The seven existing browser scenarios passed on the updated app. The new file scenario found a mobile overflow caused by long download URLs; explicit grid column widths fixed it. The affected scenario then passed on the rebuilt production server: upload, anonymous download, authenticated management, rejected cross-origin mutation, invalid-file rejection, reload/reuse, message length, confirmation reset, history containing the file URL, no mobile overflow, and immediate revocation.
- Desktop/mobile screenshots were inspected in `artifacts/file-links-desktop.png` and `artifacts/file-links-mobile.png`. The running app was also checked with agent-browser; pages rendered and no browser errors were reported.
- `npm run test:manual` still passed, including the block on automatic/provider sending.
- The encrypted local backup/restore drill now includes a synthetic uploaded PNG. Restored file bytes and link metadata matched, alongside business/member/payment counts and ledger totals; a wrong repository password was rejected.
- `/api/health` remains healthy with manual messaging and no worker required. No real WhatsApp messages were sent.

Member-facing downloads require a publicly reachable HTTPS deployment. Current localhost links are explicitly labelled as local previews. Linux/Caddy deployment and a real off-site backup remain unverified; the local restore drill does not replace those pilot checks.

## Manual WhatsApp update — 3 October 2026

- Production build and TypeScript checks passed.
- All 32 unit tests passed, including URL encoding for ₹/Hindi/newlines, message personalisation, and the manual-mode block on provider calls.
- The manual integration journey passed against PostgreSQL: current unpaid balance, business isolation, explicit send confirmation, duplicate confirmation protection, owner permissions, settlement suppression, opt-outs, and disabled automatic scheduling/sending.
- The six existing browser cases passed on the updated application. The new manual messaging browser case also passed: editable text, encoded chat link, confirmation required before recording, manual history, Meta-free settings, and health without a worker. Login sessions are reused across the suite to respect authentication rate limits. The manual case was rerun separately after correcting its textarea locator.
- All 24 existing cloud integration scenarios still passed with cloud mode enabled only inside the test process and a fake sender.
- The local database was migrated from WIN1252 to UTF-8 using pg_dump/pg_restore. All 26 application tables matched by row counts and checksums of UTF-8 content. ₹ and Hindi text passed a database round-trip. The original database was retained.
- The encrypted backup/restore drill passed again using a UTF-8 restore database.
- `/api/health` returns `healthy`, `database: up`, `messaging: manual`, and `worker: not_required`.

Manual messages use ordinary WhatsApp chat links. Browser verification inspects those links without sending real messages. The history contains user confirmations only; it does not represent provider delivery or read receipts. The earlier cloud-mode baseline below remains as historical evidence for the retained optional integration.

Current screenshots: `artifacts/manual-home.png`, `artifacts/manual-composer-mobile.png`, and `artifacts/manual-whatsapp.png`.

## Initial cloud-mode baseline

| Check                    | Result              | Evidence and limits                                                                                                                           |
| ------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript               | Passed              | `npm run typecheck`, including the final worker changes                                                                                       |
| Production build         | Passed              | All dashboard, authentication, receipt, admin, export, and webhook routes compiled; standalone assets copied successfully                     |
| Unit tests               | 28 passed           | Dates/renewals, money, consent, authenticated encryption, signatures, delivery ordering, and mocked Meta HTTP outcomes                        |
| PostgreSQL integration   | 24 scenarios passed | Real transactions and business boundaries; provider calls replaced with a fake sender                                                         |
| Browser suite            | 6 passed            | Owner journey, owner screens, staff restrictions, admin access, mobile navigation, invalid webhook signature                                  |
| Final mobile regression  | Passed              | Existing mobile browser scenario rerun after sidebar changes                                                                                  |
| Production browser check | Passed              | Fresh owner sign-in, dashboard, member directory, mobile menu, and no application browser errors                                              |
| Short screens            | Passed              | At 1280 × 600 the sidebar scrolls; at 390 × 844 the page has no horizontal overflow and the closed sidebar is hidden from keyboard navigation |
| Worker health            | Passed              | `/api/health` reported database and worker up                                                                                                 |
| Dependency audit         | Passed              | `npm audit` reported zero known vulnerabilities at implementation time                                                                        |
| Encrypted backup/restore | Passed locally      | Real pg_dump, restic, repository integrity check, wrong-password rejection, and pg_restore into a new database                                |

The full browser suite preceded the final sidebar refinement. The affected mobile case and production browser checks were rerun afterward. Changes to worker batching were validated separately against real pg-boss and PostgreSQL.

## Membership and messaging journey

The integration suite imports a member without assuming consent, records explicit consent, activates a term, records a partial payment, and dispatches a due reminder containing the remaining ₹1,500. It schedules the later reminder, settles the balance, and confirms that the later reminder is suppressed without another provider call.

Additional scenarios cover overlapping terms, cross-business member/payment access, repeated and concurrent payment submissions, owner-only reversals, daily check-in deduplication, repeated scheduler ticks, duplicate/out-of-order webhooks, ambiguous delivery outcomes, worker interruption recovery, rejected templates, disconnected senders, business suspension, STOP opt-outs, and cancellations. Unit tests cover early/late renewals, inclusive month ends, leap years, and Indian midnight boundaries.

The browser journey verifies that creating a member, activating a membership, recording a partial payment, opening a receipt, and checking in all produce the expected PostgreSQL records.

## Local load measurement

One isolated test business contained 10,000 contacts, members, memberships, charges, and payments. No unrelated build or bulk extraction was running during the final successful measurement.

| Operation                      |  Duration |
| ------------------------------ | --------: |
| Create the fixture             | 29,460 ms |
| Dashboard data/reporting       |    672 ms |
| Paginated active-member search |     86 ms |
| Persist 10,000 message records |  7,655 ms |

Dashboard and search met the local thresholds of 3 seconds and 1 second. Earlier runs were variable, including a 35-second dashboard result while other heavy local work was running. These measurements are not a concurrent-user benchmark or a guarantee for a 2-vCPU/4-GB VPS. The message insertion test uses suppressed records and measures database throughput, not WhatsApp delivery.

The worker batch drill uses real pg-boss consumers and a fake provider. It delivered 10 messages in 10,956 ms, with at least 1,042 ms between provider calls, and confirmed that the exclusive business queue rejects duplicate active/queued jobs. Batches are bounded to 45 seconds; different businesses can progress concurrently. Interrupted sends still become UNKNOWN and are never blindly retried.

## Backup drill

A local encrypted restic repository was created, checked with `--read-data`, and restored into a new uniquely named PostgreSQL database. Restored counts matched: 2 businesses, 24 members, 24 payments, and 21,700,000 paise in ledger totals. An incorrect repository password was rejected. The scratch repository and restore database were removed afterward.

Restic 0.19.1 was verified against its official SHA256SUMS; PostgreSQL 18.4 client tools came from the official Windows binary distribution. This drill validates encryption and restoration locally. It does **not** validate off-site credentials, network access, 30-day retention in a remote account, Linux backup containers, or disaster recovery from a lost VPS.

## Before the real pilot

- Build and run Docker Compose on the intended Linux VPS; validate Caddy HTTPS, migrations, restarts, resource use, and concurrent dashboard/campaign load.
- Configure SMTP and confirm actual staff invitations and password-reset delivery.
- For the current manual workflow, validate the WhatsApp account on the user's device. Messaging is enabled by default, member profiles have no consent or Stop WhatsApp control, and existing opt-outs remain effective. Meta onboarding, template approvals, and delivery webhooks are needed only if cloud messaging is adopted later.
- Configure the encrypted off-site restic repository and monitor endpoints. Restore an actual off-site snapshot and test both failed and missed backup/worker alerts.
- Create a fresh production database and onboard two real businesses. Validate their records, renewal-date expectations, and daily workflows before expanding.

At the time of the original local verification, no public deployment or live customer messaging had been performed. The Azure deployment is recorded above. The original 2-vCPU/4-GB server estimate was a sizing assumption.

## Reproduce

Follow the README setup instructions. Keep local PostgreSQL running. Pause any cloud worker while running fixture-based integration/worker tests so it cannot consume test messages. Leave the worker stopped for normal manual use.

```sh
npm run typecheck
npm test
npm run test:directory
npm run test:qr
npm run test:manual
npm run test:integration
npm run test:worker
npm run test:load
npm run test:backup
npm run build
npm run start
npm run test:e2e
```

Run load and backup drills separately from other database-mutating tests. The backup drill compares source/restored counts. Browser checks require the app at localhost:3000 and Chrome.

Ignored local evidence is stored in `artifacts/load-test.json`, `artifacts/worker-test.json`, `artifacts/backup-test.json`, `artifacts/production-dashboard.png`, `artifacts/production-mobile-members.png`, and `artifacts/production-mobile-navigation.png`.
