# EMXIN source update — 11 November 2026

This is an **incremental source-code update**, not a certified production-ready release. It is derived from the supplied EMXIN incremental source ZIP.

## Changes made in this update
- Added admin daily analytics endpoint for the last 1–30 days and a 7-day visitor/paid-purchase chart on the dashboard.
- Added homepage CMS snapshot history, list and Super Admin restore endpoint; CMS publishes now snapshot previous state.
- Added homepage editor history/restore controls.
- Restricted homepage publishing and commerce settings modification to Super Admin, with input validation and an allowed-field list.
- Preserved prior storefront, admin, and backend files.

## Checks
- Python backend `compileall`: PASSED.
- ZIP integrity: checked after packaging.
- Next.js install/build: NOT VERIFIED. Offline npm dependency installation failed due to uncached @types/node; no build was run.
- Database integration, live PayStation, SMS, Steadfast, AWS S3, end-to-end checkout: NOT VERIFIED.

## Important outstanding work
- Full visual drag-and-drop CMS with drafts, scheduling, media rollback.
- Robust product variant inventory/reservation lifecycle, dealer discounts and refunds.
- Live OTP/SMS, payment gateway, courier API testing with credentials and webhook verification.
- Complete RBAC enforcement across every endpoint and production security review.
- Integration and UI tests and migration/rollback tests against a safe copy of production data.

Do not deploy this ZIP to production without completing the above and running the build/test/deployment checklist.
