# Bills, receipts and membership cards

The approved blue/white bill and black/gold card layouts are available in the app:

- Member → Payments → View bill, including before any payment is recorded.
- Payment history → View opens the receipt for that payment.
- Member → Member QR → Open membership card. The existing QR download and owner-only replacement flow remain available.
- Each document has Download image (PNG at double resolution) and Print (including the browser's Save as PDF).
- Settings contains the business logo, phone and address. Edit member contains a separate photo upload/save control; new members can add a photo after creation.

Documents use actual stored records, with initials if a photo or logo is absent. No reference images or sample records are inserted. A bill uses the charge's fee/tax/discount snapshot. Total paid and balance include reversals, and waivers show zero payable. A receipt separately identifies the individual payment and includes its reversal notice when applicable. These documents are not GST tax invoices.

The card displays the current membership, otherwise the nearest upcoming membership, otherwise the latest non-cancelled membership (or a cancelled term if no other exists). It labels expired, cancelled, archived and no-plan states. Its QR comes from the existing encrypted attendance token; downloading or printing does not rotate it.

Images are private and tenant scoped. Member photo uploads use a 2 MB streamed limit, image signature/decode validation, bounded dimensions, orientation normalization, metadata removal and WebP storage. Changes are audited. Member photos cascade with member deletion. Business contact fields default to empty for existing workspaces.

Apply migrations with `npm run db:migrate`, generate the Prisma client, then build. Local migrations were applied without resetting the database.

Verification: unit tests for document totals/status; existing member billing and QR integration checks; `e2e/member-documents.spec.ts` exercises settings, uploads, access, unpaid bills, partial receipts, downloaded PNGs, exported QR decoding, print PDFs, reversals, waivers, long content and image fallbacks. The existing billing browser test uses the new receipt layout. Preview files under `artifacts/member-documents/implemented-*` use disposable synthetic fixtures; their QR codes are no longer valid after test cleanup.
