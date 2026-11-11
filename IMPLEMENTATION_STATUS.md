# EMXIN implementation status — 2026-11-11

This archive is a **partial implementation / development preview**, NOT a complete v1.2 delivery or production-certified release.

## Implemented in this patch
- Admin product create/edit/publish form using existing FastAPI endpoints; S3 presigned image uploads when credentials and bucket/CORS are configured.
- Homepage hero/promo form editor with section order controls (not drag-and-drop, not a full CMS).
- Customer-account wishlist REST endpoints, product-card black-outline/blue-filled heart, wishlist page, multi-select add to local cart.
- Basic local cart list and multi-item order submission through existing checkout.
- Admin read-only payments list (NOT refunds, settlement, manual verification).
- Header wishlist/cart/login links and automatic-year copyright footer.

## Not implemented / not verified
- Full EN/BN translation, category visual mega-navigation, complete visual CMS and legal-page editing, product variant-level inventory, manual payment verification, payment gateway integration testing, refund/settlement, safe media replacement history and S3 cleanup, and full responsive design QA.
- S3 bucket policies, CloudFront distribution, environment variables, deployment secrets, gateway credentials and actual cloud connectivity are not included.
- No real MongoDB, PayStation or AWS integration test has been performed. Do not deploy to production without validation.
- Existing application dependencies are pinned to historical versions. Review security advisories and update/test before production.

## Verification
- Python backend syntax compilation completed successfully.
- Next.js TypeScript build NOT executed: npm dependencies are not present in this archive and are not installed in this environment.

## Before deployment
1. Create backups of MongoDB, S3, and existing deployment.
2. Test on staging, not production.
3. Configure S3 with least-privilege IAM, CORS allowing the admin origin and CloudFront origin access; never expose private AWS keys in NEXT_PUBLIC variables.
4. Run `npm ci` (or `npm install` if no lockfile) and `npm run build` separately in frontend/ and admin/.
5. Run backend API integration tests with an isolated test MongoDB and validate customer/admin authorization.
6. Confirm cart checkout, pricing, stock and order creation under concurrent orders.
7. Validate payment IPN signatures and status verification before accepting live payments.
8. Test UI on mobile and desktop and review accessibility.
