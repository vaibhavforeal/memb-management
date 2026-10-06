# membrr light theme and landing page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole app to a light theme with a deep-navy brand and blue gradients, and add a public landing page at `/`.

**Architecture:** The UI is token-driven (`@theme inline` in `src/app/globals.css`), so the theme change is a token swap plus a sweep of the few dark-only color usages. Brand gradients become CSS utilities. The landing page is a set of small server components under `src/components/landing/`, composed by `src/app/page.tsx`.

**Tech Stack:** Next.js 16 (App Router, Server Components; read `node_modules/next/dist/docs/` before touching routing/metadata APIs, per `AGENTS.md`), React 19, Tailwind CSS 4, Radix UI, lucide-react, Vitest (`tests/**/*.test.ts`, node env), Playwright e2e (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-10-06-light-theme-landing-design.md`

## Global Constraints

- Light mode only; remove `class="dark"` from `<html>` and `color-scheme: dark` from inputs. No theme toggle.
- Brand colors exactly as the spec token table: background `#f6f8fc`, foreground `#0b1220`, card/popover `#ffffff`, primary `#1d4ed8`, primary-foreground `#ffffff`, secondary/muted `#eef2fa`, muted-foreground `#55627a`, accent `#e8efff`, accent-foreground `#1e3a8a`, destructive `#b42318`, border `#dde4f0`, input `#cbd5e6`, ring `#2563eb`.
- Gradients exactly: `--brand-gradient: linear-gradient(135deg, #0b1f4b 0%, #1e3a8a 45%, #2563eb 100%)`, `--brand-gradient-soft: linear-gradient(135deg, #1e40af, #2563eb)`, `--sidebar-gradient: linear-gradient(180deg, #0b1f4b, #102a63)`.
- All text/background pairs meet WCAG AA (4.5:1 normal text, 3:1 large). Check white text at the lightest gradient stop.
- Brand name is lowercase `membrr` everywhere, including the landing page copy. Wordmark is `membrr` plus an accent dot until the logo arrives; it lives in one component.
- Landing price is read from `SIGNUP_MONTHLY_FEE_PAISE` and trial length from `TRIAL_DAYS` (both in `src/lib/workspace-access.ts`), never typed as literals.
- The landing page ships no client JS (FAQ uses `<details>`; the hero chart is inline SVG).
- Motion stays at 150 ms hover transitions; keep the `prefers-reduced-motion` block in `globals.css`.
- This folder is not a git repository: skip commit steps. Track changes by listing touched files in the final summary.
- Local DB and e2e: terminals run as Administrator; `db:local` uses `pg_ctl` on Windows.

## Review Focus

- Signed-in visitor opens `/`: sees **Go to dashboard**, not signup CTAs (Task 5 e2e).
- Expired or garbage session cookie on `/`: treated as signed out, page renders, no redirect loop or 500 (Task 5 `getSession(...).catch(() => null)` plus e2e with a bad cookie).
- Landing price and trial length drift from signup: copy must be built from `SIGNUP_MONTHLY_FEE_PAISE` and `TRIAL_DAYS` (Task 5 unit test on `buildFaqs`, plus e2e comparing with `/signup`).
- 390 px mobile width: landing page has no horizontal scroll and the nav CTAs stay reachable (Task 5 e2e).
- Status text that was tuned for dark (amber/sky on tinted pills, `text-amber-200` notices) becomes unreadable on white (Task 3 source-guard test and badge contrast test).

---

### Task 1: Light tokens and contrast test

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `tests/theme.test.ts`

**Interfaces:**
- Produces: CSS custom properties `--brand-gradient`, `--brand-gradient-soft`, `--sidebar-gradient`; utility classes `.bg-brand-gradient`, `.bg-brand-gradient-soft`, `.bg-sidebar-gradient`, `.auth-backdrop` (soft blue radial/linear page backdrop for auth pages), all in `globals.css`. Tokens keep their existing names so components need no renames.

- [ ] **Step 1: Write the failing test** in `tests/theme.test.ts`. Read `src/app/globals.css` with `node:fs`, collect every `--color-<name>: #rrggbb` into a map, and implement a local `contrast(hexA, hexB): number` (WCAG relative luminance). Test `"token pairs meet WCAG AA"` asserts `>= 4.5` for: foreground/background, foreground/card, card-foreground/card, primary-foreground/primary, muted-foreground/background, muted-foreground/card, muted-foreground/muted, accent-foreground/accent, destructive/card, primary/background, primary/card. Test `"is a light theme"` asserts `--color-background` luminance > 0.8 and that `layout.tsx` contains no `className="dark"`. Test `"defines brand gradients"` asserts the three gradient custom properties exist with the exact values from Global Constraints.

- [ ] **Step 2: Run to confirm failure.** Run: `npx vitest run tests/theme.test.ts`. Expected: FAIL (dark palette; no gradient properties).

- [ ] **Step 3: Replace the `@theme inline` color tokens** in `globals.css` with the values in Global Constraints. Add the three gradient custom properties under `:root` and the four utility classes. Change input `color-scheme` to `light`; `::selection` to `#2563eb33`; checkbox `accent-color` to `#1d4ed8`; `.data-table th` background to `#f1f5fc` and row hover to `#f8faff`; `.subtle-grid` dot color to `#0b1f4b14`. Add `html { scroll-padding-top: 5rem; scroll-behavior: smooth; }` (the existing reduced-motion block already disables smooth scrolling).

- [ ] **Step 4: Remove `className="dark"`** from `<html lang="en">` in `src/app/layout.tsx`. In the same file, add `metadataBase` to the exported `metadata`: `new URL(process.env.BETTER_AUTH_URL)` only when that variable is a valid URL, otherwise omitted (must not throw at build time).

- [ ] **Step 5: Run** `npx vitest run tests/theme.test.ts`. Expected: PASS.

---

### Task 2: Wordmark, gradient button and navy shell

**Files:**
- Create: `src/components/wordmark.tsx`
- Modify: `src/components/ui/button.tsx`, `src/components/shell.tsx`

**Interfaces:**
- Produces: `Wordmark({ tone?: "dark" | "light"; className?: string })` server-safe component rendering the gradient icon tile (`Activity` icon) plus `membrr` and an accent dot. `tone="dark"` is ink text for light backgrounds (default); `tone="light"` is white text for navy surfaces. Tasks 4 and 5 consume it.

- [ ] **Step 1: Create `Wordmark`** in `src/components/wordmark.tsx` with the interface above. The tile uses `.bg-brand-gradient-soft` and white icon; the dot is `text-primary` on dark tone and `text-sky-300` on light tone.

- [ ] **Step 2: Update `button.tsx`**: the `default` variant becomes `bg-brand-gradient-soft text-primary-foreground shadow-sm hover:brightness-110`; `ghost`/`outline` keep tokens. No signature change.

- [ ] **Step 3: Restyle `shell.tsx`**: the `<aside>` replaces `bg-[#151a18]` with `bg-sidebar-gradient text-white`; nav link inactive state `text-white/70 hover:bg-white/10 hover:text-white`, active state `bg-white/15 text-white` with a `bg-sky-300` indicator dot; the close/sign-out buttons and workspace picker (`bg-background/30` card) become `border-white/15 bg-white/5` with `text-white/70` secondary lines; eyebrow labels inside the aside get `text-white/50`; replace the inline logo block with `<Wordmark tone="light" />`. Sidebar focus rings must stay visible: add `focus-visible:outline-white` on aside links and buttons. The overlay `bg-black/60` becomes `bg-[#0b1f4b]/50`. The mobile header bar stays light (it sits above the light content). The support banner changes `text-amber-200 border-amber-400/30 bg-amber-400/5` to `text-amber-900 border-amber-300 bg-amber-50`.

- [ ] **Step 4: Run** `npx tsc --noEmit`. Expected: no errors.

---

### Task 3: Status colors, chart, avatar and hard-coded hex sweep

**Files:**
- Modify: `src/components/ui/badge.tsx`, `src/components/collections-chart.tsx`, `src/components/avatar.tsx`, `src/components/business-logo.tsx`, `src/components/business-checkout.tsx`, `src/app/(workspace)/dashboard/page.tsx`, `src/app/(workspace)/billing/page.tsx`, `src/app/(workspace)/members/page.tsx`, `src/app/(workspace)/members/[id]/page.tsx`, `src/app/(workspace)/payments/page.tsx`, `src/components/manual-composer.tsx`, `src/components/member-payments.tsx`, `src/components/message-files.tsx`, `src/components/ui/dialog.tsx`
- Modify: `tests/theme.test.ts`

**Interfaces:**
- Consumes: Task 1 tokens.

- [ ] **Step 1: Add failing source-guard tests** to `tests/theme.test.ts`. Test `"no dark-only palette classes remain"` walks `src/**/*.{ts,tsx,css}` (skip `member-document.css`) and fails on matches of `/(text|bg|border)-(amber|sky|emerald|rose|green|yellow)-(100|200|300|400)\b/` and `/#(b6f09c|151a18|151d17|101413|191f1c|202824|2d3731)/i`, listing offending `file:line`. Test `"badge status pairs meet AA"` imports the color map from `src/components/ui/badge.tsx` (export it as `statusColors`) and asserts that every `text-*-N` / `bg-*-N` pair uses a 700-or-darker text shade on a 50-or-100 background (explicit allowlist: `text-amber-800`, `text-sky-800`, `bg-amber-50`, `bg-sky-50`).

- [ ] **Step 2: Run** `npx vitest run tests/theme.test.ts`. Expected: FAIL listing the files above.

- [ ] **Step 3: Fix each hit.** Mapping: `text-amber-200|300|400` → `text-amber-800`; `bg-amber-400/10` → `bg-amber-50`; `text-sky-300` → `text-sky-800`; `bg-sky-400/10` → `bg-sky-50`; `text-emerald-700` in `business-logo.tsx` stays (already light-safe). In `badge.tsx`, export `statusColors` (rename the existing `colors` constant) and keep `Badge`'s signature. In `collections-chart.tsx`: stroke/fill `#2563eb`, gradient stops opacity 0.25→0, grid `#dde4f0`, tick fill `#55627a`, tooltip background `#ffffff` with border `#dde4f0` and a soft shadow. In `avatar.tsx`: four pairs `bg-[#e0e9ff] text-[#1e3a8a]`, `bg-[#e3f3ea] text-[#14532d]`, `bg-[#fdf0d6] text-[#7a4a06]`, `bg-[#f6e3ef] text-[#7a1f4f]`. Dashboard donut: active `#1d4ed8`, remainder `#dbe4f6`; the `bg-[#526859]` dot becomes `bg-[#8aa0c8]`. `business-checkout.tsx` Razorpay `theme.color` becomes `#1d4ed8`. `dialog.tsx` overlay becomes `bg-[#0b1f4b]/50`.

- [ ] **Step 4: Run** `npx vitest run tests/theme.test.ts`. Expected: PASS.

---

### Task 4: Auth and status pages

**Files:**
- Modify: `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`, `src/app/invite/[token]/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/access-pending/page.tsx`, `src/app/suspended/page.tsx`, `src/app/upgrade/page.tsx`, `src/app/admin/page.tsx`, `src/components/login-form.tsx`

**Interfaces:**
- Consumes: `Wordmark` (Task 2), `.auth-backdrop`, `.bg-brand-gradient` (Task 1).

- [ ] **Step 1: Login page.** Replace the left panel's `bg-[#151d17]` with `bg-brand-gradient text-white`, remove `subtle-grid` or recolor it for navy, set its headline accent span to `text-sky-300`, its supporting paragraph to `text-white/75`, and swap the inline logo for `<Wordmark tone="light" />`. The right half uses `.auth-backdrop`; its mobile logo becomes `<Wordmark />`.

- [ ] **Step 2: Centered-card pages** (`signup`, `forgot-password`, `reset-password`, `invite/[token]`, `onboarding`, `access-pending`, `suspended`, `upgrade`): add `auth-backdrop` to the page `<main>` and replace each inline `Activity` + `membrr.` logo with `<Wordmark />`. Cards keep `bg-card border rounded-xl` and add `shadow-sm`. Admin page: swap its wordmark only.

- [ ] **Step 3: `login-form.tsx`**: verify the Google button, inputs and error text use tokens only; fix any color that assumes a dark background.

- [ ] **Step 4: Run** `npx tsc --noEmit` and `npx vitest run`. Expected: no type errors, all tests pass.

---

### Task 5: Landing page

**Files:**
- Create: `src/components/landing/content.ts`, `nav.tsx`, `hero.tsx`, `product-mockup.tsx`, `features.tsx`, `how-it-works.tsx`, `pricing.tsx`, `faq.tsx`, `cta-band.tsx`, `footer.tsx` (all under `src/components/landing/`)
- Modify: `src/app/page.tsx`
- Create: `tests/landing-content.test.ts`, `e2e/landing.spec.ts`

**Interfaces:**
- Consumes: `Wordmark` (Task 2), `buttonVariants` from `src/components/ui/button.tsx`, `Badge`, `money` from `src/lib/domain`, `SIGNUP_MONTHLY_FEE_PAISE` and `TRIAL_DAYS` from `src/lib/workspace-access`, `auth` from `src/lib/auth`.
- Produces in `content.ts`: `features: { icon: LucideIcon; title: string; text: string }[]` (6 items: Members and plans, Payments and receipts, QR attendance, WhatsApp reminders, Reports and CSV export, Staff access with roles); `steps: { title: string; text: string }[]` (3 items); `buildFaqs(feeLabel: string, trialDays: number): { q: string; a: string }[]` (5 items: payments in INR, data ownership, how WhatsApp reminders work (staff send manually from their own WhatsApp), staff access, what happens after the trial; the trial answer contains `` `${trialDays} days` `` and `feeLabel`). Component props: `Nav({ signedIn }: { signedIn: boolean })`, `Hero({ signedIn })`, `Pricing({ feeLabel: string; trialDays: number })`, `CtaBand({ signedIn })`; the others take no props.

- [ ] **Step 1: Write the failing unit test** `tests/landing-content.test.ts`: `features` has 6 items and `steps` has 3, with non-empty `title`/`text`; `buildFaqs(money(SIGNUP_MONTHLY_FEE_PAISE), TRIAL_DAYS)` returns 5 items, the trial answer includes `"3 days"` and the formatted fee, and `buildFaqs("₹999", 7)` changes that answer to include `"7 days"` and `"₹999"` (proves nothing is hard-coded).

- [ ] **Step 2: Run** `npx vitest run tests/landing-content.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `content.ts`** per the interface. Copy must match `APPLICATION_OVERVIEW.md` (manual WhatsApp, no automatic sending claims; INR; Razorpay for subscription only; QR attendance by staff scanner).

- [ ] **Step 4: Run** the unit test again. Expected: PASS.

- [ ] **Step 5: Implement the section components** following the spec's section list. Nav is `sticky top-0 z-30` with a translucent white background and bottom border: wordmark, links to `#features`, `#pricing`, `#faq` (hidden below `sm`), then Sign in (`/login`, ghost) and Start free trial (`/signup`, default gradient button); when `signedIn`, show only **Go to dashboard** (`/dashboard`). Hero is `bg-brand-gradient text-white`: `<h1>` "A little less admin. A lot more community.", supporting line for gyms and sports arenas, CTAs Start free trial (`/signup`) and See how it works (`#how`) (signed in: Go to dashboard replaces the first); `ProductMockup` sits beside it on `lg` and below on mobile, a static white card with a stat row, a 4-row `data-table` of fake members with `Badge` statuses, and an inline-SVG area trend, labeled "Demo data". Section wrappers use `max-w-6xl mx-auto px-4`, ids `features`, `how`, `pricing`, `faq`. Pricing is one centered card with `feeLabel`, "per month", `trialDays`-day free trial copy ("No card required"), a checklist, and the Start free trial CTA. FAQ renders `buildFaqs(...)` as `<details>`/`<summary>`. Footer: `Wordmark`, Sign in, Sign up, and `© <year> membrr`.

- [ ] **Step 6: Replace `src/app/page.tsx`**: an `async` server component that calls `auth.api.getSession({ headers: await headers() }).catch(() => null)` to compute `signedIn`, computes `feeLabel = money(SIGNUP_MONTHLY_FEE_PAISE)`, and renders `Nav`, `Hero`, `Features`, `HowItWorks`, `Pricing`, `Faq`, `CtaBand`, `Footer` inside one `<main>`. Export `metadata` with `title: { absolute: "membrr · Memberships, made simple" }`, a description, and basic `openGraph`. Check the Next.js 16 docs in `node_modules/next/dist/docs/` for the metadata and dynamic-rendering APIs before writing it.

- [ ] **Step 7: Write the e2e spec** `e2e/landing.spec.ts` (use `ensureLocalTest` and login helper patterns from `e2e/platform.spec.ts`): (a) signed out: `h1` visible, **Start free trial** link `href` is `/signup`, pricing text equals `money(SIGNUP_MONTHLY_FEE_PAISE)` and matches the amount shown on `/signup`; (b) a garbage `better-auth.session_token` cookie renders the same signed-out page with HTTP 200; (c) signed in as the demo owner (`owner@membrr.local`), `/` shows **Go to dashboard** and no **Start free trial**; (d) at a 390×844 viewport `document.documentElement.scrollWidth <= window.innerWidth` and the Start free trial button is visible.

- [ ] **Step 8: Run** `npx playwright test e2e/landing.spec.ts` against the local app (`npm run dev` plus local DB). Expected: all four tests pass.

---

### Task 6: Docs, full verification and visual review

**Files:**
- Modify: `APPLICATION_OVERVIEW.md` (lines about the dark theme and the `/` redirect), `README.md` if it mentions either, `.superdesign/design-system.md`

- [ ] **Step 1: Update docs.** `APPLICATION_OVERVIEW.md` line "uses a dark application theme" becomes the light navy/blue theme; the `page.tsx` tree entry and the `/` route-table row describe the landing page; `.superdesign/design-system.md` palette paragraph is replaced with the new tokens.

- [ ] **Step 2: Run the full automated checks**: `npx tsc --noEmit`, `npx vitest run`, `npm run build`. Expected: all succeed.

- [ ] **Step 3: Run the e2e suite**: `npx playwright test`. Expected: all pass. Specs only assert text and roles, so no assertion on dark colors should break; fix any that do.

- [ ] **Step 4: Screenshot review** with the browser tools at 1440×1000 and 390×844 for `/`, `/login`, `/signup`, `/dashboard`, `/members`, `/payments`, `/billing`, an open dialog, and a printed receipt. Check for leftover dark surfaces, unreadable text, broken sidebar contrast, focus rings, and horizontal overflow; fix and re-shoot.

- [ ] **Step 5: Final grep** `grep -rniE "b6f09c|text-amber-200|dark" src` returns nothing relevant; summarize every file touched for the user.
