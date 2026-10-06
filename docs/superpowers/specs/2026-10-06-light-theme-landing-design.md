# membrr light theme and landing page — design

Date: 2026-10-06 · Status: awaiting written-spec review

## Intent

Restyle the whole application from the current dark emerald theme to a light theme with a deep-navy brand and professional blue gradients, and add a public landing page at `/` that sells the product to independent gyms and sports arenas in India and sends visitors to `/signup`.

Success looks like:

- Every existing page is readable and consistent in the new theme, with no leftover dark-only colors.
- `/` is a polished marketing one-pager instead of a redirect.
- The logo can be dropped in later by changing one component and a few CSS tokens.

Out of scope: a dark/light toggle, new product features, new marketing pages, stock photography, and a real logo (a text wordmark stays until it arrives).

## Decisions made with the user

- Light mode only; the dark theme is removed, not kept behind a toggle.
- Brand is dark blue with a gradient blue, not emerald.
- Light working area; deep-navy gradient on the sidebar, mobile top bar and landing hero.
- Landing page is a focused one-pager (no extra routes).
- Logo arrives later; use the current wordmark (`membrr` + accent dot) meanwhile.

## 1. Theme

All colors stay as tokens in `src/app/globals.css` (`@theme inline`). Components keep using `bg-card`, `text-muted-foreground`, etc., so most files need no change.

| Token | Value | Note |
| --- | --- | --- |
| `--color-background` | `#f6f8fc` | cool off-white page |
| `--color-foreground` | `#0b1220` | ink |
| `--color-card` / `popover` | `#ffffff` | |
| `--color-primary` | `#1d4ed8` | white text on it ≈ 6.7:1 |
| `--color-primary-foreground` | `#ffffff` | |
| `--color-secondary` | `#eef2fa` | |
| `--color-muted` | `#eef2fa` | |
| `--color-muted-foreground` | `#55627a` | ≥ 5:1 on white and on background |
| `--color-accent` | `#e8efff` | |
| `--color-accent-foreground` | `#1e3a8a` | |
| `--color-destructive` | `#b42318` | |
| `--color-border` | `#dde4f0` | |
| `--color-input` | `#cbd5e6` | |
| `--color-ring` | `#2563eb` | focus outline |

New tokens and utilities:

- `--brand-gradient: linear-gradient(135deg, #0b1f4b 0%, #1e3a8a 45%, #2563eb 100%)` for the hero and large brand surfaces.
- `--brand-gradient-soft: linear-gradient(135deg, #1e40af, #2563eb)` for primary buttons.
- `--sidebar-gradient: linear-gradient(180deg, #0b1f4b, #102a63)` for the sidebar and mobile top bar.
- Utility classes `.bg-brand-gradient`, `.bg-brand-gradient-soft`, `.bg-sidebar-gradient` in `globals.css`.

Global CSS changes in `globals.css`:

- `color-scheme: dark` on inputs becomes `light`.
- `::selection` and checkbox `accent-color` use the new blue.
- `.data-table` header and row-hover tints change from white-alpha to blue-grey tints (`#f1f5fc`, `#f8faff`).
- `.subtle-grid` dot color changes to a dark-alpha dot.

`src/app/layout.tsx`: remove `className="dark"` from `<html>`.

## 2. Component touch-ups

Known dark-only spots (from an audit of hard-coded colors and Tailwind palette classes):

- `src/components/shell.tsx`: sidebar and mobile bar use `.bg-sidebar-gradient` with light text. Nav items get a translucent-white active state; the workspace picker, WhatsApp status and avatar footer are restyled for the navy surface. The one hex color in this file is reviewed.
- `src/components/ui/button.tsx`: `default` variant uses `.bg-brand-gradient-soft` with a hover brightness shift; other variants keep token classes.
- `src/components/ui/badge.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`: verified against the new tokens. `dialog.tsx` has a `bg-black` overlay that is kept but tuned for light pages.
- Status colors tuned for white backgrounds (`text-amber-200` → `text-amber-800` on `bg-amber-50`, `text-sky-300` → `text-sky-800` on `bg-sky-50`, etc.) in the 11 files that use them. Semantic meaning (success green, amber warning, rose failure) is unchanged.
- `src/components/collections-chart.tsx`, `src/components/avatar.tsx`, `src/app/(workspace)/dashboard/page.tsx`: hard-coded hexes replaced with the blue palette; avatar palette picks readable pairs on white.
- `src/app/login/page.tsx`, `signup`, `forgot-password`, `reset-password`, `invite`, `onboarding`, `access-pending`, `suspended`, `upgrade`, `admin`: auth and status pages get the same centered-card layout on a soft blue gradient backdrop. The stylistic wordmark (`membrr.` with an accent dot) is reused through a shared `Wordmark` component so the logo swap is a one-file change.
- `src/components/member-document.css` and receipt/bill/member-card pages: already print-oriented; verified, not restyled, except for removing any assumption of a dark body.

## 3. Landing page (`src/app/page.tsx`)

`/` renders the landing page instead of redirecting. It is a Server Component using `connection()` only if it needs the session; it reads the session to swap the nav and hero CTA to **Go to dashboard** for signed-in users. Everything else is static.

Sections, top to bottom:

1. **Nav**: sticky, wordmark left; links to Features, Pricing, FAQ; Sign in (ghost) and Start free trial (gradient button). Collapses to a simple stacked bar on mobile.
2. **Hero**: full-width navy gradient. Headline, sub-copy ("A little less admin. A lot more community."), primary CTA Start free trial → `/signup`, secondary CTA See how it works → `#how`. A product mockup on the right built from the real UI primitives (card, badge, `data-table`) plus an inline SVG trend line (not the recharts client component, so the page ships no chart JS), with clearly fake demo data (Indian names, INR).
3. **Features** (`#features`): six blocks with Lucide icons: Members and plans; Payments and receipts; QR attendance; WhatsApp reminders (manual-send, honest wording); Reports and CSV export; Multi-staff access with roles. Copy matches what the product actually does per `APPLICATION_OVERVIEW.md`.
4. **How it works** (`#how`): three steps: create your workspace, add members and plans, collect and track.
5. **Pricing** (`#pricing`): one card: 3 days free, no card required, then `money(SIGNUP_MONTHLY_FEE_PAISE)` per month, with an included-features list and the Start free trial CTA. The price is read from `SIGNUP_MONTHLY_FEE_PAISE` so it never drifts from signup.
6. **FAQ** (`#faq`): native `<details>` elements, no client JS. Topics: payments in INR, data ownership, WhatsApp behavior, staff access, what happens after the trial.
7. **Closing CTA band**: navy gradient, repeat the signup CTA.
8. **Footer**: wordmark, Sign in, Sign up, and a copyright line. No contact address or social links until you supply them.

Metadata: page title `membrr · Memberships, made simple` (existing root metadata), plus Open Graph basics and `metadataBase` from `BETTER_AUTH_URL`.

Components live in `src/components/landing/` (one file per section: `nav.tsx`, `hero.tsx`, `features.tsx`, `how-it-works.tsx`, `pricing.tsx`, `faq.tsx`, `cta-band.tsx`, `footer.tsx`), each a small server component with no shared state, composed in `page.tsx`.

## 4. Accessibility and motion

- All text/background pairs meet WCAG AA (4.5:1 normal, 3:1 large). White text on gradient surfaces is checked at the lightest gradient stop.
- Focus rings stay visible (`#2563eb` on light, white-ish on navy surfaces).
- Motion stays at subtle 150 ms hover transitions; `prefers-reduced-motion` handling in `globals.css` is kept.
- Landing anchors are real links; FAQ uses semantic `<details>/<summary>`.

## 5. Verification

- `npm run typecheck` and `npm test` pass.
- `npm run build` succeeds.
- Playwright e2e suite passes. Specs that assert on dark-theme classes or colors, if any, are updated.
- Screenshots reviewed at 1440 px and 390 px for `/`, `/login`, `/signup`, `/dashboard`, `/members`, `/payments`, `/billing`, plus one dialog and one printed receipt.
- Contrast spot-checks on muted text, status pills and gradient surfaces.

## 6. Risks and notes

- Tailwind palette classes tuned for dark (`text-amber-200` etc.) would be near-invisible on white; they are all listed above and swept by grep, then re-grepped for completeness.
- The logo is not available; the `Wordmark` component isolates this.
- This repo is not under git here, so there is no diff to roll back from; changes are made file by file and listed in the final summary.
