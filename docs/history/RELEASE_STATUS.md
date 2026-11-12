# EMXIN implementation update — 2026-11-11

This archive contains the entire supplied application tree plus additional implementation, but **IS NOT a certified final production release**.

## Newly implemented in this revision
- Storefront phone OTP request, verification, and passwordless login/auto-registration UI, with registration URL using the same flow.
- Backend customer phone OTP flow already present in prior archive retained.
- Dealer qualifying discount tiers 5/8/12/15% based on previously Delivered/Completed dealer orders; >=20 pieces; only active dealers with admin discount approval; optional admin override endpoint. Non-approved orders do not receive dealer bulk discount. IMPORTANT: the original pricing/order lifecycle remains and needs comprehensive regression testing.
- Dealer application/approval SMS queued to a MongoDB outbox with idempotency keys, admin dispatch/retry endpoints; provider-specific Nishchit client is configurable but not live verified. Dispatch must be invoked by admin or a scheduler; no background worker has been installed.
- Delivery quote API: Dhaka/other regular fee, express only when an admin-verified surcharge exists; no fabricated Steadfast live rate. Admin settings allow surcharge map.
- S3 media version metadata recording and listing endpoints; this does NOT implement safe restore, object lifecycle cleanup or actual upload completion validation.
- MongoDB indexes for SMS outbox and media versions.

## Testing actually performed
- Python compileall syntax check: PASS.
- ZIP integrity: PASS.
- Next.js builds: NOT RUN (dependency installation unavailable in this environment).
- Database-backed API, OTP provider, PayStation, courier, AWS S3, UI and E2E tests: NOT RUN.

## Important unresolved requirements
- Production PayStation reconciliation and provider status verification.
- Steadfast live express rate verification and full checkout selection.
- Full visual drag-and-drop CMS, admin footer editor, complete product variant stock reservations and refunds.
- Dealer application form's full phone-only OTP conversion and full SMS worker scheduling.
- S3 media restore/rollback and complete security/RBAC and database transaction audit.
- Final branding and visual pixel-parity across all responsive screens.

Do not deploy to production until dependencies, database migration/backup, secrets, external provider credentials, full builds, security and integration tests are completed.
