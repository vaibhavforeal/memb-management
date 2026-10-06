# membrr admin console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/admin` with a platform console served at `console.membrr.pro` from the same Next.js app, with overview, workspaces, revenue, users and audit pages, and deploy it.

**Architecture:** `src/proxy.ts` rewrites console-host requests into `src/app/console/*` and hides those routes on other hosts, using a pure `consoleRoute()` function. Console queries and mutations live in `src/lib/console/`, server actions in `src/app/console/actions.ts`, every page guarded by `requireConsoleAdmin()`. Cookies the workspace UI needs are set by two small route handlers on the main host that the console hands off to.

**Tech Stack:** Next.js 16 App Router (`proxy.ts`, not `middleware.ts`; read `node_modules/next/dist/docs/` first per `AGENTS.md`), React 19, Better Auth, Prisma/PostgreSQL, Tailwind 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-admin-console-design.md`

## Global Constraints

- Env: `CONSOLE_URL` (e.g. `https://console.membrr.pro`, dev `http://console.localhost:3000`), `CONSOLE_HOST` (e.g. `console.membrr.pro`, dev `console.localhost:3000`). `BETTER_AUTH_URL` stays the main site. Both console vars unset ⇒ console unreachable, `/admin` 404.
- Console sign-in is email + password only; no Google button, no signup link, no demo prefill.
- Every console page, route handler and server action calls `requireConsoleAdmin()`.
- Every console mutation writes an `AuditLog` row; action names exactly: `CONSOLE_TRIAL_EXTENDED`, `CONSOLE_MARKED_PAID`, `CONSOLE_STATUS_CHANGED`, `CONSOLE_INVITE_RESENT`, `CONSOLE_ADMIN_GRANTED`, `CONSOLE_ADMIN_REVOKED`, `CONSOLE_SESSIONS_REVOKED`, `SUPPORT_ACCESS_GRANTED`; fee changes reuse `saveBusinessFee()` and its audit. User-level rows use `businessId: null`, target user id in `entityId`.
- Admin safeguards: cannot revoke yourself; cannot revoke the last platform admin.
- Lists paginate at 50 rows.
- UI follows the existing light theme: navy `bg-sidebar-gradient` sidebar, `Wordmark tone="light"`, `Card`, `Badge`, `.data-table`, `PageHeading`, `ActionForm`, `Dialog`.
- Lowercase brand `membrr`. This folder is not a git repo: skip commit steps.
- External writes (Hostinger DNS, Azure hostname/cert/app settings/deploy) each need explicit user confirmation first; Azure only via `AZURE_CONFIG_DIR=.local/azure-pep` (never change the default `az` login).
- E2E sign-ins go through `e2e/sign-in.ts` (rate-limit aware).

## Review Focus

- A non-admin with a valid session opens any console URL directly (including `/api/console/orders.csv` and a server action POST): must be signed out/refused, never shown data (Task 2 guard tests + Task 7 e2e).
- Host header spoofing / casing: `Console.Membrr.Pro` and a trailing port must route the same as the canonical host; an unknown host must never reach `/console/*` (Task 1 table test).
- Login `next` parameter with `//evil.com`, `https://evil.com`, `/\evil.com` must fall back to `/dashboard` (Task 6 unit test).
- Last admin revokes themselves via a crafted POST with their own id: refused even if the UI hides the button (Task 4 unit test on `canRevokeAdmin`, enforced in the mutation).
- CSV export with workspace names containing commas, quotes, newlines or a leading `=`: must be escaped and formula-neutralized (Task 5 unit test).

---

### Task 1: Host routing and auth origin

**Files:**
- Create: `src/lib/console/route.ts`, `src/proxy.ts`, `tests/console-route.test.ts`
- Modify: `src/lib/auth.ts`, `.env.example`, local `.env` (dev values)

**Interfaces:**
- Produces: `consoleRoute(host: string, pathname: string, env: { consoleHost?: string; consoleUrl?: string }): { type: "rewrite"; pathname: string } | { type: "redirect"; url: string } | { type: "not-found" } | { type: "next" }`; `isConsoleHost(host: string, consoleHost?: string): boolean` (case-insensitive exact match including port).

- [ ] **Step 1:** Write `tests/console-route.test.ts` covering every row of spec §1's table, plus: mixed-case host matches; `console.membrr.pro.evil.com` does not match; `/` → `/console`; `/workspaces/abc` → `/console/workspaces/abc`; `/api/auth/sign-in/email` on console host → `next`; `/admin/x` on main host → redirect to `consoleUrl`; consoleHost unset ⇒ `/console` not-found and `/admin` not-found.
- [ ] **Step 2:** Run `npx vitest run tests/console-route.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `src/lib/console/route.ts` (pure, no Next imports).
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** Create `src/proxy.ts` exporting `proxy(request: NextRequest)` that maps the result to `NextResponse.rewrite(new URL(pathname, request.url))`, `NextResponse.redirect(url)`, a 404 via `NextResponse.rewrite(new URL("/_console-not-found", request.url))` *or* `new NextResponse(null, { status: 404 })` (pick per proxy docs), or `NextResponse.next()`. Host from `request.headers.get("host")`. `config.matcher` excludes `_next/static`, `_next/image`, `favicon.ico` and paths with a file extension.
- [ ] **Step 6:** In `src/lib/auth.ts` add `trustedOrigins: [process.env.CONSOLE_URL].filter(Boolean) as string[]`. Add `CONSOLE_URL`/`CONSOLE_HOST` to `.env.example` (commented production examples) and dev values `http://console.localhost:3000` / `console.localhost:3000` to `.env`.
- [ ] **Step 7:** `npx tsc --noEmit` clean; start dev server; `curl -s -o /dev/null -w "%{http_code}" -H "Host: localhost:3000" http://localhost:3000/console` → `404`.

### Task 2: Schema change, guard and console shell

**Files:**
- Modify: `prisma/schema.prisma` (`AuditLog.businessId String?`, `business Business?`)
- Create: migration via `npx prisma migrate dev --name audit_log_optional_business`, `src/lib/console/guard.ts`, `src/app/console/layout.tsx`, `src/app/console/login/page.tsx`, `src/app/console/(authed)/layout.tsx`, `src/components/console/console-shell.tsx`, `tests/console-guard.test.ts`
- Modify: `src/components/login-form.tsx` (props `redirectTo?: string` default `"/dashboard"`, `showDemoHint` unchanged)

**Interfaces:**
- Produces: `requireConsoleAdmin(): Promise<{ id: string; name: string; email: string }>` (redirects to `/login` or `/login?error=not_admin` after `auth.api.signOut`); `consoleAccess(user: { platformAdmin?: boolean } | null): "anonymous" | "forbidden" | "ok"` (pure, unit-tested). `ConsoleShell({ admin, children })` client component with nav: Overview `/`, Workspaces `/workspaces`, Revenue `/revenue`, Users `/users`, Audit `/audit` (paths as seen on the console host; active state from `usePathname()` which reports the *rewritten* path `/console/...`, so strip the `/console` prefix before comparing).

- [ ] **Step 1:** Unit test `consoleAccess` (null → anonymous, `{platformAdmin:false}` → forbidden, true → ok) → FAIL → implement in `guard.ts` → PASS.
- [ ] **Step 2:** Schema edit + migration on the local DB (`db:local` must be running). Fix any TypeScript errors from the now-nullable relation (`grep -rn "auditLog" src` and `npx tsc --noEmit`).
- [ ] **Step 3:** Console login page: `Wordmark` + "Console" label on `auth-backdrop`, `LoginForm` with `googleEnabled={false}`, `demo={false}`, `redirectTo="/"`, and the not-admin message when `?error=not_admin`.
- [ ] **Step 4:** `(authed)/layout.tsx` calls `requireConsoleAdmin()` and renders `ConsoleShell`. `dynamic = "force-dynamic"`.
- [ ] **Step 5:** `npx tsc --noEmit`, `npx vitest run` → all pass.

### Task 3: Overview and workspaces pages

**Files:**
- Create: `src/lib/console/queries.ts`, `src/app/console/(authed)/page.tsx`, `src/app/console/(authed)/workspaces/page.tsx`, `src/app/console/(authed)/workspaces/[id]/page.tsx`, `tests/console-metrics.test.ts`

**Interfaces:**
- Produces in `queries.ts`: `platformOverview(now?: Date)`, `listWorkspaces({ q, state, page })`, `workspaceDetail(id)`; pure helper `summarizeWorkspaces(rows: { status: string; monthlyFeePaise: number | null; trialRequired: boolean; trialEndsAt: Date | null; billingPaidThrough: Date | null }[], now: Date): { byState: Record<WorkspaceAccess | "SUSPENDED", number>; mrrPaise: number }` (suspended counted separately and excluded from state buckets; MRR = sum of fees of PAID and not suspended).

- [ ] **Step 1:** Unit test `summarizeWorkspaces` with a fixture of one of each state + one suspended paid workspace + a paid one with null fee → FAIL → implement → PASS.
- [ ] **Step 2:** Overview page per spec §3 (counts, MRR, revenue this IST month, signups 7/30 days, total members, health cards moved from old admin page).
- [ ] **Step 3:** Workspaces list with search/state filter/pagination (GET form, query params) and the "New business" dialog posting to console action `console-create` (Task 4).
- [ ] **Step 4:** Workspace detail page with all sections from spec §3; action buttons wired to Task 4 actions.
- [ ] **Step 5:** `npx tsc --noEmit` clean.

### Task 4: Console server actions

**Files:**
- Create: `src/lib/console/mutations.ts`, `src/app/console/actions.ts`, `tests/console-mutations.test.ts`

**Interfaces:**
- Produces: `extendTrialEnd(current: Date | null, days: number, now: Date): Date` (pure; `max(now, current) + days`, days integer 1–90 else throws); `canRevokeAdmin(actorId: string, targetId: string, adminCount: number): string | null` (returns error text or null); `consoleAction(_: ActionState, form: FormData): Promise<ActionState>` with `_action` values `console-create`, `console-fee`, `console-extend-trial`, `console-mark-paid`, `console-status`, `console-resend`, `console-support`, `console-admin`, `console-signout-user`.
- Consumes: `createBusiness`, `saveBusinessFee`, existing invite resend logic (move it into `mutations.ts` and call it from both places), `ActionForm` (add optional `serverAction` prop defaulting to `mutate` so console forms post to `consoleAction`).

- [ ] **Step 1:** Unit tests: `extendTrialEnd` (null current, past current, future current, 0 and 91 rejected); `canRevokeAdmin` (self → error, last admin → error, otherwise null) → FAIL → implement → PASS.
- [ ] **Step 2:** Implement each action per spec §3/§4 with audit rows. `console-create` returns `redirectTo: "/workspaces/<id>"`. `console-support` returns `redirectTo: \`${BETTER_AUTH_URL}/support/start?grant=<id>\``. `console-mark-paid` requires a 10–500 char note and a valid date. `console-admin` toggles `platformAdmin` enforcing `canRevokeAdmin` against a fresh count. `console-signout-user` deletes the user's sessions. All call `revalidatePath("/console", "layout")`.
- [ ] **Step 3:** `ActionForm` gets `serverAction?: typeof mutate`; its `router.push` must use `window.location.assign` when `redirectTo` is absolute (cross-host handoff).
- [ ] **Step 4:** Remove the `admin-*` and `admin-support` branches from `src/app/actions.ts`; `end-support` redirects to `CONSOLE_URL ?? "/dashboard"`. Delete `src/app/admin/page.tsx`.
- [ ] **Step 5:** `npx tsc --noEmit`, `npx vitest run` → pass.

### Task 5: Revenue, users and audit pages + CSV

**Files:**
- Create: `src/app/console/(authed)/revenue/page.tsx`, `src/app/console/(authed)/users/page.tsx`, `src/app/console/(authed)/users/[id]/page.tsx`, `src/app/console/(authed)/audit/page.tsx`, `src/app/api/console/orders.csv/route.ts`, `src/lib/console/csv.ts`, `tests/console-csv.test.ts`
- Modify: `src/lib/console/queries.ts` (`listOrders`, `monthlyRevenue`, `listUsers`, `userDetail`, `listAudit`)

**Interfaces:**
- Produces: `csvCell(value: string | number | null): string` (quotes when needed, doubles quotes, prefixes `'` when value starts with `=`, `+`, `-`, `@`, tab or CR); `ordersCsv(rows): string` with header `Created,Workspace,Amount (INR),Status,Period start,Period end,Razorpay order,Razorpay payment`.
- The CSV route must 404 on non-console hosts (it is under `/api`, which the proxy passes through, so check `isConsoleHost` inside the handler) and call `requireConsoleAdmin()`.

- [ ] **Step 1:** Unit tests for `csvCell`/`ordersCsv` covering commas, quotes, newlines, formula prefixes, null → FAIL → implement → PASS.
- [ ] **Step 2:** Pages per spec §3 with GET-form filters and pagination; user detail shows sessions and the two actions from Task 4 (hide "Revoke admin" for self but still enforced server-side).
- [ ] **Step 3:** `npx tsc --noEmit`, `npx vitest run` → pass.

### Task 6: Main-host handoff routes and login `next`

**Files:**
- Create: `src/app/support/start/route.ts`, `src/app/open/[businessId]/route.ts`, `src/lib/safe-next.ts`, `tests/safe-next.test.ts`
- Modify: `src/app/login/page.tsx`, `src/components/login-form.tsx` (use `redirectTo` from `safeNext(searchParams.next)`)

**Interfaces:**
- Produces: `safeNext(value: string | undefined, fallback = "/dashboard"): string` — accepts only paths starting with a single `/` and not `//` or `/\`.

- [ ] **Step 1:** Unit test `safeNext` with the Review Focus inputs plus `/members?tab=x` (kept) → FAIL → implement → PASS.
- [ ] **Step 2:** Route handlers per spec §4; both return 404 when `isConsoleHost` is true; unauthenticated → redirect `/login?next=<path+query>`; invalid grant → 403 HTML "This support link is invalid or has expired."
- [ ] **Step 3:** `npx tsc --noEmit`, `npx vitest run` → pass.

### Task 7: E2E coverage and existing-suite migration

**Files:**
- Create: `e2e/console.spec.ts`
- Modify: `e2e/sign-in.ts` (optional `origin` argument: navigates to `${origin}/login`), `e2e/admin-workspaces.spec.ts` (create workspace through the console, then open it via the `/open/<id>` handoff)

- [ ] **Step 1:** Write `e2e/console.spec.ts` with the six scenarios in spec §7, creating its own admin and owner fixtures (pattern from `admin-workspaces.spec.ts`) and cleaning up.
- [ ] **Step 2:** Run against the dev server with console env set: `npx playwright test e2e/console.spec.ts e2e/admin-workspaces.spec.ts` → all pass (fix code, not assertions, when they fail for real).
- [ ] **Step 3:** Full suites: `npx vitest run`, `npx playwright test`, `npx tsc --noEmit`, `npm run build` → all green.
- [ ] **Step 4:** Screenshot review at 1440 and 390 px of console login, overview, workspaces, workspace detail, revenue, users, user detail, audit; fix layout issues.

### Task 8: Deploy console.membrr.pro (each step confirmed with the user)

- [ ] **Step 1:** Ask the user to start the pep session (`! AZURE_CONFIG_DIR=.local/azure-pep az login --use-device-code --tenant e00ad81d-d2be-4dba-a8a8-3bd7585a7fd2`).
- [ ] **Step 2:** Confirm, then add Hostinger DNS with `overwrite: false`: `console` CNAME `pep-b5f5axg9fjgucsg8.centralindia-01.azurewebsites.net.`, `asuid.console` TXT = `customDomainVerificationId`. Verify with `nslookup` against `aurora.dns-parking.com`.
- [ ] **Step 3:** Confirm, then set app settings `CONSOLE_URL=https://console.membrr.pro`, `CONSOLE_HOST=console.membrr.pro`; add hostname, create managed certificate, SNI bind.
- [ ] **Step 4:** Confirm, then package (`pwsh -File ops/package-azure.ps1`), deploy per `docs/AZURE-DEPLOYMENT.md`, and run `npm run db:migrate` as the release step.
- [ ] **Step 5:** Verify: `https://console.membrr.pro/login` 200 over valid TLS; `https://membrr.pro/console` 404; `https://membrr.pro/admin` → redirect to console; admin sign-in works.
- [ ] **Step 6:** `az logout`, delete `.local/azure-pep`; update `APPLICATION_OVERVIEW.md` and `docs/AZURE-DEPLOYMENT.md` with the console host and env vars.
