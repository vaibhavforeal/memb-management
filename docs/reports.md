# Reports

Open **Reports** in the workspace navigation. Owners and staff can view reports;
CSV downloads require owner access, matching the member directory export policy.
Every report and download is restricted to the current business and requires
active workspace access. Successful exports are recorded in the audit log.

- **Member list:** current members with contact details, membership status, plan,
  join date, expiry and outstanding amount. Filter by status, plan or member search.
  Archived members are excluded. Early renewals do not replace today's active plan.
- **Collections:** gross receipts, reversals, net collections and ledger-entry
  counts grouped by day, week or month. Filter by payment method and member search.
  Zero-activity periods are included. A reversal reduces collections on the date
  it was recorded, even when its original receipt belongs to an earlier period.
- **Dues & outstanding:** current unpaid charges after all receipts and reversals,
  with net paid, balance and ageing (current, 1–30, 31–60, 61–90, over 90 days).
  Filter for overdue or current charges. Archived members and cancelled memberships
  retain their debts; waived charges are excluded. Due today is not overdue.
- **Renewals:** terms expiring within the selected dates, with next booked term
  dates. Filter for members needing renewal or with a later term booked. Excludes
  cancelled terms and archived members. A booked term can still have a gap in access.
- **Attendance:** check-in counts per visiting member, with first and last visit
  dates. Historical visits remain included after a member is archived.

Collection, renewal and attendance reports support this/last week, this/last month,
and custom dates up to 366 days. Renewals default to the next 30 days. Dates are
inclusive in Asia/Kolkata; weeks begin Monday. Partial first and last collection
periods are clipped to the selected dates. Member and dues reports show the current
position, not a historical balance or membership snapshot.

Tables show 25 rows per page. Summary cards cover the entire filtered report.
**Export CSV** includes all filtered rows, regardless of the current page, with
ISO dates and INR amounts to two decimal places. Text formula prefixes are escaped;
numeric values, including negative net collections, remain suitable for spreadsheet
calculations. CSV downloads reflect live data at the time of export.

Reports introduce no additional tables or environment settings. A source release
still requires **all repository migrations**, including those used by the shared
workspace, member profiles and billing. After deployment, `/api/health` must
report both `database: up` and `schema: ready`.

Verification: `npm test`, `npm run test:reports`, and
`npx playwright test e2e/reports.spec.ts` against a running local app. Database and
browser tests use temporary workspaces and refuse non-local database connections.
