# Join It product review for membrr

Reviewed on 3 October 2026 through the signed-in Join It account in the Codex in-app browser.

This is a review of the account's main navigation, its available section pages, and selected detail screens. It is not a functional test of every control. No forms were submitted, no integrations were connected, and no account settings or membership records were changed. The account is in Test Mode; several charts explicitly display sample data.

## Main sections

| Section | Pages and behavior observed | Relevance to membrr |
| --- | --- | --- |
| [Dashboard](https://app.joinit.com/dashboard) | Setup checklist; trial status; active memberships; payments; recent members, payments, emails and donations; internal comments; administrators; metric tabs; shortcuts to fields, cards and membership types. | Lead with daily operations. Keep onboarding collapsible and move secondary tools out of the main dashboard. |
| [Members](https://app.joinit.com/members) | Status totals, membership-type/status/custom-field filters, joined and expiry date filters, sorting, member table, import/export links, add-member form and detailed membership records. | Use a dense table with compact status tabs and visible payment/WhatsApp actions. |
| [Membership Types](https://app.joinit.com/membership-types) | Price, duration, rebilling, collected fields, display order and detail pages. Details include visibility, initial status, age restrictions, order quantities, benefits, renewal settings, checkout link, trials, check-in limits and confirmation content. | Retain membrr's compact plan rows. Put advanced options in an edit panel instead of repeating them on every plan. |
| [Member Portal](https://app.joinit.com/portal/customize) | Branding, portal modules, layout, organization information, widgets and portal settings. The member-facing portal offers membership information, payment details, events and posts. | Useful for a later member self-service release. |
| [Automations](https://app.joinit.com/automations) | An integration catalog with connection status, including Stripe, Eventbrite, Mailchimp, Zapier, QuickBooks, Klaviyo, Google Analytics, Slack and webhooks. | A connection-status pattern is useful later. Manual WhatsApp remains the selected communication mode. |
| [Communication](https://app.joinit.com/communication) | One-off messages, saved email templates, audience selection, history, renewal shortcuts, automated emails and posts. | Adapt audience and template patterns to a manual WhatsApp follow-up workflow. |
| [Events](https://app.joinit.com/events) | Active/expired events, search, grid/table views, creation form, registration analytics, registration search, custom registration fields and Eventbrite options. | Relevant later for workshops or classes. This does not establish support for court/turf time-slot booking. |
| [Finance](https://app.joinit.com/payments/1) | Payment count/value charts, online/offline and category filters, date filters, invoice search, exports, payouts, tax rules and offline checkout settings. | Useful filtering and reporting ideas for cash, UPI and bank entries; retain separate charges, payments and outstanding balances. |
| [Insights](https://app.joinit.com/metrics) | Membership trends, payments, donations, communication, check-ins, demographics, portal analytics, registrations, churn reasons, churn demographics and membership length before churn. Reports cover memberships, payments, check-ins, Eventbrite and event registrations. | Prioritize collections, outstanding fees, renewals, attendance and retention before adding broader analytics. |
| [Settings](https://app.joinit.com/settings) | Billing, administrator management, API resources, currency, timezone, connection management and owner-only data reset/deletion entry points. | Keep business settings separate from platform administration. |
| Support and account | FAQ, help-center and chat entry points; account name/email, language, password/security entry points, email preferences, organizations and memberships. | Group these below operational navigation. |

## Member operations

The member directory distinguishes **prospective, pending, active and inactive** memberships. Rows show profile photo, status, member, membership type, joined date and expiry. Sort options include name, email, membership type, joined date, expiry and last update.

The add-member form includes membership type, quantity, optional online/offline payment, confirmation-email option, name, email, membership ID and internal notes. The inspected membership profile exposes:

- Payment, email and event-registration actions.
- Status, membership ID, joined date, plan and expiry.
- Internal comments and member information.
- Check-in action and history summary.
- Payments, Timeline, Recent Emails and Digital Cards tabs.
- Plan transfer, billing, merge and deletion entry points.

These controls were inspected without changing the member. Renewal calculations, payment accounting, merge correctness and permission enforcement were not tested.

### Member settings

| Tool | Observed behavior |
| --- | --- |
| [Custom fields](https://app.joinit.com/member-settings/membership-fields) | Separate member-facing fields and admin-only fields, with creation and activation management. |
| [Digital cards](https://app.joinit.com/member-settings/cards) | Setup entry point for cards compatible with Apple Wallet and Google Wallet. No card was created or sent. |
| [Check-in tools](https://app.joinit.com/member-settings/check-in) | Kiosk/scanner entry point, a check-in permission setting, date-based analytics, channel/plan breakdown, recent and most-frequent check-ins. |
| [Membership IDs](https://app.joinit.com/member-settings/membership-ids) | Manual assignment or automatic sequential IDs. |
| [Primary field](https://app.joinit.com/members/primary-field) | Name, reversed name or company name, applying to all or selected membership types. |
| [Gift memberships](https://app.joinit.com/member-settings/gifts) | Gift purchase links and a gift history table. This account had no gifts. |
| [Cancellation policy](https://app.joinit.com/members/cancellation-policy) | Member self-cancellation or custom cancellation instructions, plus cancellation-reason feedback. The page explicitly says cancellation does not issue a refund. |
| [Merge rules](https://app.joinit.com/member-settings/merge) | Limited automatic merging, matching email and plan, predicted similar records, or no automatic merging. |
| [Discounts](https://app.joinit.com/members/discounts) | The account must connect Stripe before creating discounts. |

The [import page](https://app.joinit.com/members/bulk-import) requires plans and fields to be prepared first. It supplies a template to email to Join It support. It says self-import access is provided case by case. membrr's existing direct CSV preview/import workflow is worth retaining.

## Portal and communications

[Portal customization](https://app.joinit.com/portal/customize) supports a logo, header image, module ordering and vertical/horizontal layouts. Modules include Membership Options, Upcoming Events, Posts, Directory and Donations. [Portal information](https://app.joinit.com/portal) contains business identity, URL, contact details, social links and address.

[Widgets](https://app.joinit.com/portal-widgets) include buttons, links, embedded checkout, donations, directory and events. [Portal settings](https://app.joinit.com/portal-settings) cover directory, social sharing, language and whether members can edit their information. The directory configuration was blocked by an upgrade notice requiring the Total or Extra package.

The member-facing portal was inspected with the existing membership. It exposes joined/expiry dates, membership ID, renewal, editing and cancellation links. Payment Details offers a payment-method entry point. Events and Posts were empty in this account. No renewal, cancellation, payment or profile change was performed.

[Quick messages](https://app.joinit.com/communication) include shortcuts for memberships expiring within 1, 7 or 30 days. [Audience selection](https://app.joinit.com/communication/select-audience) supports individual/multiple recipients, status, plan, joined date and expiry date, with a recipient count.

[Automated emails](https://app.joinit.com/notifications) cover joining, renewal, manual-renewal reminders, upcoming automatic rebilling, payment confirmations, failed payments, expiry, cancellation, donations and event registrations. The interface shows active/paused status and administrator recipients. Test Mode redirects those emails to designated administrators.

For membrr, use these segmentation and template ideas with the agreed manual flow: open WhatsApp with the member's number and prepared text, then let staff explicitly record that they sent it. Images/documents remain shared links. A click on WhatsApp must not imply delivery or reading.

## Finance, reports and administration

[Payments](https://app.joinit.com/payments/1) separates online and offline channels and membership, donation and event categories. The account had no payment records. [Payouts](https://app.joinit.com/finances/payouts) stopped at Stripe connection setup. [Finance settings](https://app.joinit.com/finance-settings) includes tax/fee rules, offline checkout and member invoice information; UK Gift Aid is shown as requiring GBP.

[Reports](https://app.joinit.com/reports) offers packaged and custom exports. The inspected membership, payment, check-in and registration report pages describe date/segment filters, selectable columns and saved templates. Packaged reports are processed and sent to an inbox. [Automated reports](https://app.joinit.com/automated-reports) offers a monthly PDF and weekly metrics email. No export or scheduled email was triggered.

[Manage Admins](https://app.joinit.com/manage-admins) offers Owner, Manager, Frontdesk and Read-only roles. These labels describe staff within one organization. They are distinct from membrr's `/admin`, which controls business onboarding and access across the platform.

[Developer Tools](https://app.joinit.com/developers) lists API documentation, app keys and webhooks. No app keys were present; none were created. [Data Settings](https://app.joinit.com/settings) includes currency, timezone and connected services, plus owner-only reset/delete entry points. Destructive flows were not opened.

## Recommendations for membrr

1. **Preserve compact plan rows.** Keep name, duration, price, active state and actions on one desktop row, with actions wrapping on narrow screens. The current compact direction fits daily administration better than repeated pricing cards.
2. **Use small, actionable status filters.** Put Active, Expiring Soon, Expired and Outstanding counts beside the member table. Open less common filters on demand.
3. **Keep member work in one place.** A concise summary with Memberships, Payments, Attendance, WhatsApp and Notes/Activity views should make the next staff action obvious.
4. **Refine the manual WhatsApp queue.** Provide due-today, expiring-in-7-days and overdue segments; reusable text; recipient preview; file links; and explicit manual-send history.
5. **Offer reusable reports.** Start with collections, unpaid balances, expiries and attendance, with date filters and column selection. Saved filters are useful before automated delivery.
6. **Add custom fields when pilot users need them.** Distinguish member-visible information from staff-only fields. Prefer duplicate warnings and deliberate merges to automatic merging of financial histories.
7. **Keep later features separate.** Member self-service, digital cards/QR check-in, class/event registration and integrations remain candidates for later releases. Donations, gifting and a public member directory have lower relevance to the current gym/arena pilot.

A practical navigation remains **Dashboard · Members · Plans · Payments · Attendance · WhatsApp · Reports · Settings**, with platform administration available separately to authorized platform staff.

## Visual observations and limits

The review used the in-app browser's existing narrow viewport. Screenshots confirmed the responsive navigation drawer, member summary cards and member-facing portal. No desktop viewport or 10,000-member performance test was performed.

Join It uses grouped navigation, breadcrumbs, tables, detail tabs, descriptive settings panels and extensive onboarding/empty states. In the narrow view, its large status cards, explanatory panels and repeated support footer push operational content down the page. For membrr, concise helper text, compact rows, collapsible onboarding and small filter controls are the most useful adaptations.

All main navigation sections were reviewed, along with the important child pages described above. Connected integration behavior, paid directory features, checkout, email delivery, digital-card issuance and every nested editor were outside this read-only review. No conclusions about their correctness, scale or security follow from seeing their controls.

This review makes recommendations; it does not change the application or expand the agreed MVP scope.
