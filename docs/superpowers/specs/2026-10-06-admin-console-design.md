# membrr admin console at console.membrr.pro — design

Date: 2026-10-06 · Status: awaiting written-spec review

## Intent

Replace the single `/admin` page with a full platform console served at `https://console.membrr.pro`, for platform administrators to run the business: see platform health and revenue, manage workspaces, inspect payments, manage users and admin rights, and read the audit trail.

Success looks like:

- `console.membrr.pro` serves only the console; `membrr.pro` no longer exposes any admin UI.
- Every action the old `/admin` page offered still works from the console, plus the new ones below.
- Every console action leaves an audit entry.
- The console is live over HTTPS on the existing `pep` App Service.

Out of scope: two-factor auth or IP allowlisting (the user chose password-only), a separate App Service, Google sign-in on the console, editing workspace data (members, payments) from the console beyond support access.

## Decisions made with the user

- Features: overview dashboard, workspace detail pages, revenue & payments, users & audit.
- Hosting: same Next.js app and App Service, routed by host name.
- Console sign-in: email + password only.
- Support access stays in the console, via a cross-host handoff.

## 1. Routing

New file `src/proxy.ts` (Next.js 16 renamed `middleware` to `proxy`; see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). It exports `proxy(request)` and a matcher that excludes `_next/static`, `_next/image`, `favicon.ico` and files with an extension.

Decision logic lives in a pure function so it can be unit-tested:

```
consoleRoute(host: string, pathname: string, consoleHost: string | undefined)
  -> { type: "rewrite"; pathname: string }
   | { type: "redirect"; url: string }
   | { type: "not-found" }
   | { type: "next" }
```

Rules (host compared case-insensitively, port included):

| Request | Result |
| --- | --- |
| console host, `/api/*` | `next` (auth and console APIs work unchanged) |
| console host, `/console/*` | `rewrite` to the same path (idempotent) |
| console host, any other path `/x` | `rewrite` to `/console/x` (`/` → `/console`) |
| other host, `/console` or `/console/*` | `not-found` |
| other host, `/admin` or `/admin/*` | `redirect` to `CONSOLE_URL` (if set), else `not-found` |
| anything else | `next` |
| `CONSOLE_HOST` unset | console routes `not-found` everywhere, `/admin` `not-found` |

Environment:

- `CONSOLE_URL` — public origin, e.g. `https://console.membrr.pro` (dev: `http://console.localhost:3000`).
- `CONSOLE_HOST` — host header to match, e.g. `console.membrr.pro` (dev: `console.localhost:3000`).
- `BETTER_AUTH_URL` stays `https://membrr.pro`.

`src/lib/auth.ts` adds `trustedOrigins: [process.env.CONSOLE_URL]` (filtered for empty) so the console origin can sign in. Cookies remain host-only; each host has its own session.

The old `src/app/admin/page.tsx` is deleted.

## 2. Console sign-in and guard

- `src/app/console/login/page.tsx`: wordmark + "Console" label, email and password form (reuses `LoginForm` with Google disabled and no demo prefill), no signup link.
- After a successful sign-in the client navigates to `/` (console overview).
- `requireConsoleAdmin()` in `src/lib/console/guard.ts`: reads the session; no session → redirect to `/login`; session whose user is not `platformAdmin` → sign the session out (`auth.api.signOut`) and redirect to `/login?error=not_admin`, shown as "This account doesn't have console access."
- Every console page and console route handler calls `requireConsoleAdmin()`. Console server actions call it too.
- Console layout `src/app/console/layout.tsx`: navy sidebar (reusing the existing sidebar styling and `Wordmark tone="light"`) with Overview, Workspaces, Revenue, Users, Audit, and the signed-in admin with sign-out.

## 3. Pages

All paths below are as seen on the console host (they live under `src/app/console/`).

### `/` Overview

- Counts of workspaces by state using `workspaceAccess()`: Trial, Paid, Payment due, Trial expired, Legacy; plus Suspended (`status !== "ACTIVE"`).
- MRR: sum of `monthlyFeePaise` over workspaces currently `PAID`.
- Revenue collected this month: sum of paid `BusinessBillingOrder.amountPaise` with `paidAt` in the current IST month.
- New workspaces in the last 7 and 30 days; total members across all workspaces.
- Health: reminder worker / manual WhatsApp mode and last backup (moved from the old page), Razorpay configured or not.

### `/workspaces`

- Table: name, city, owner email, state badge, members, monthly fee, paid through / trial ends, created.
- Search by name, city or owner email (`?q=`), filter by state (`?state=`), 50 per page (`?page=`).
- "New business" dialog (existing `admin-create` behavior).

### `/workspaces/[id]`

- Header: name, city, state badge, created date.
- Sections: owners and staff (email, role, joined); pending invitations; billing (fee, paid through, trial ends, state); recent billing orders (20); support-session history (grants with actor, reason, created, expiry); audit log for this workspace (latest 50, link to `/audit?business=<id>`).
- Actions (console server actions, each audited):
  - Set monthly fee (existing behavior, blank disables billing).
  - Extend trial by N days (1–90): `trialEndsAt = max(now, trialEndsAt) + N days`.
  - Mark paid through a date: sets `billingPaidThrough`; requires a note (10–500 chars), recorded in the audit detail.
  - Suspend / reactivate (existing behavior).
  - Resend owner invitation (existing behavior).
  - Start support access (see §4).
  - Open workspace (see §4), shown only when the admin has OWNER access to it.

### `/revenue`

- Table of `BusinessBillingOrder` across workspaces: created, workspace, amount, status (`Paid` when `paidAt` set, otherwise `Pending`), period, Razorpay order/payment ids.
- Filters: status (`?status=paid|pending`), month (`?month=YYYY-MM`), workspace search; 50 per page.
- Monthly totals for the last 12 months (paid amount and order count).
- CSV export at `/api/console/orders.csv` with the same filters (console host only, admin only).

### `/users` and `/users/[id]`

- `/users`: search by email or name (`?q=`), 50 per page; columns: name, email, platform admin, workspaces count, created.
- `/users/[id]`: profile, workspaces with role, active sessions (created, last updated, IP, user agent), and actions:
  - Grant / revoke platform admin. Rules: cannot revoke yourself; cannot revoke the last remaining platform admin.
  - Force sign-out: deletes all of the user's sessions. Signing yourself out this way is allowed and ends the console session.

### `/audit`

- Platform-wide `AuditLog`, newest first, 50 per page.
- Filters: workspace (`?business=`), actor email (`?actor=`), action (`?action=`), date range (`?from=`, `?to=`).
- Shows workspace name (or "Platform" when `businessId` is null), actor email, action, detail, time.

## 4. Cross-host handoffs (support access, open workspace)

Cookies for the workspace UI (`membrr-support`, `membrr-business`) must be set on `membrr.pro`, but the action starts on the console host.

- Support access: the console action validates the reason (10–500 chars), creates the `SupportGrant` and the `SUPPORT_ACCESS_GRANTED` audit entry, then returns a redirect to `${BETTER_AUTH_URL}/support/start?grant=<id>`.
- Open workspace: the console links to `${BETTER_AUTH_URL}/open/<businessId>`.
- New main-host route handlers `src/app/support/start/route.ts` and `src/app/open/[businessId]/route.ts` (404 on the console host per the proxy):
  - No session on `membrr.pro` → redirect to `/login?next=<original path>`; the login page honors `next` only when it is a same-origin relative path.
  - `support/start`: grant must exist, belong to the signed-in user, be unexpired, and the user must be `platformAdmin`; then set `membrr-support` (httpOnly, sameSite lax, secure in production, expires at the grant expiry), clear `membrr-business`, redirect to `/dashboard`. Otherwise 403 page text "This support link is invalid or has expired."
  - `open/[businessId]`: user must be `platformAdmin` with OWNER access to that business; then set `membrr-business` as `admin-open` does today and redirect to `/dashboard`.
- `end-support` now redirects to `CONSOLE_URL` (falls back to `/dashboard` when unset).

## 5. Data and audit

- Migration: `AuditLog.businessId` becomes nullable (`String?`, relation optional). Existing rows unchanged.
- Fee changes reuse the existing billing service and its existing audit entry (no new action name).
- New audit actions: `CONSOLE_TRIAL_EXTENDED`, `CONSOLE_MARKED_PAID`, `CONSOLE_STATUS_CHANGED`, `CONSOLE_INVITE_RESENT`, `CONSOLE_ADMIN_GRANTED`, `CONSOLE_ADMIN_REVOKED`, `CONSOLE_SESSIONS_REVOKED`, plus existing `SUPPORT_ACCESS_GRANTED`. User-level actions store `businessId: null` and the target user id in `entityId`.
- Console data access lives in `src/lib/console/` (queries and mutations), separate from the tenant-scoped services. Server actions live in `src/app/console/actions.ts`.

## 6. Deployment

- DNS at Hostinger for `membrr.pro` (add, never overwrite existing records): `console` CNAME `pep-b5f5axg9fjgucsg8.centralindia-01.azurewebsites.net.`; `asuid.console` TXT with the App Service verification id.
- Azure (separate `pep` CLI session, never the default login): add hostname `console.membrr.pro`, create managed certificate, SNI bind; set app settings `CONSOLE_URL=https://console.membrr.pro`, `CONSOLE_HOST=console.membrr.pro`.
- Deploy the new build to `pep` via the existing source-zip flow; run the migration as the documented release step.
- Each external write is confirmed with the user before it is made.

## 7. Testing

- Unit (`tests/`): `consoleRoute()` table above; `extendTrialEnd()`; admin-revoke safeguards (`canRevokeAdmin(actorId, targetId, adminCount)`); orders CSV row formatting (escaping, rupee amounts); `next` parameter sanitizing on login.
- E2E (`e2e/console.spec.ts`, using `http://console.localhost:3000` and the shared `signIn` helper):
  - Non-admin owner signs in on the console and is refused with the not-admin message.
  - Admin signs in; Overview, Workspaces, workspace detail, Revenue, Users, user detail and Audit render.
  - Extend trial on a fixture workspace updates the trial date and appears in Audit.
  - Revoking own admin is refused.
  - `http://localhost:3000/console` returns 404 and `/admin` redirects to the console.
  - Support access handoff lands on `/dashboard` of the fixture workspace with the support banner.
- Existing unit and e2e suites keep passing; `e2e/admin-workspaces.spec.ts` is updated to the console.

## 8. Risks

- Console sessions are password-only by the user's choice; a leaked admin password exposes all workspaces. Mitigations in scope: audit on every action, force sign-out, and the existing auth rate limit.
- Admins need to be signed in on both hosts for handoffs; the handoff routes send them to sign in first and return them.
- `console.localhost` resolution relies on the browser/OS resolving `*.localhost` to loopback (Chrome does); Playwright uses Chrome.
