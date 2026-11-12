# EMXIN Storefront Correction Preview — 2026-11-11

## Implemented in source (not deployed)
- Removed placeholder E logo from storefront and footer; Admin Homepage Editor accepts company logo upload through existing presigned S3 endpoint, plus configurable logo URL.
- Replaced Categories dropdown-style link with visual image tile navigation using API categories.
- Changed New Collection nav label to New Arrivals; removed duplicate Dealer nav link, kept Become a Dealer.
- Removed global EN/BN switcher; retained bilingual toggle in dealer registration page.
- Replaced text/emoji cart with SVG cart icon.
- Clickable trust row: delivery info, payment methods, genuine-products disclosure, support page, dealer benefits.
- Removed FULLY CUSTOMIZABLE HOMEPAGE badge from public promo.
- Dealer benefits: conditional 5%, 8%, 12%, 15% by order count, minimum 20 items, explicitly not guaranteed; registration stays on same page.
- Linked footer category, support, dealer and policy destinations.
- Draft pages for privacy, return, terms, delivery, payments and contact; Admin Homepage Editor allows editing their text.
- Added public /api/v1/site-content endpoint backed by existing homepage document.

## Important limitations / next iteration
- These changes are not yet built or integration-tested against live database, AWS S3 or CloudFront.
- Express Steadfast real-time quote and checkout pricing integration **NOT implemented**: must inspect Steadfast's supported rate/quote API and merchant contract before adding a verified amount to the existing ৳70 base regular delivery charge. Never hard-code an unverified express charge.
- Admin controls for trust card titles, dealer tiers, all footer categories and CMS page layouts are not yet complete.
- Contact page currently shows general text; actual Facebook/Messenger URL is configured in Admin and used by footer, but the contact page itself needs a live support button.
- Privacy/return/terms text are editable drafts, not legal advice. Confirm claim submission window, applicable consumer law, and personal data practices before publishing.
- Image-based category tiles require category image fields in the API data; otherwise tasteful placeholders appear.
- Mobile category navigation requires dedicated responsive testing.
- No npm dependencies were installed in this environment, so Next.js build validation was not run.

## Deployment
Staging only after backups. Review diff, run npm ci / npm run build in frontend and admin, test FastAPI with MongoDB and S3, and verify checkout end-to-end. Do not overwrite production based on this preview alone.
