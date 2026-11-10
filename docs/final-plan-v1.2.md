# EMXIN V1.2 Final Plan

## Deployment
- One GitHub monorepo, one EC2 clone at `/var/www/emxin-platform`.
- Host Ubuntu Nginx + Certbot (not containerized).
- Docker services independently buildable: frontend `4310`, admin `4320`, backend `8430`.
- Cloudflare Free in front of EC2 Elastic IP.
- MongoDB Atlas M0.
- S3 private media bucket + CloudFront CDN for logo, favicon, hero/banner, category, product images/video and approved uploads.

## Storefront
- Dynamic Smart Glasses / Sunglasses / Frames and future admin-created categories.
- Dynamic brand filters (AIMB, JM91, GT51, TXK and future brands).
- New Collection prominence, Featured, promotions, stock visibility, STOCK OUT.
- Quantity request drawer with per-color quantities, Normal/Priority/Urgent, business name and optional dealer registration.
- 1–5 pcs flat delivery; 6+ estimated weight shipping; 20+ bulk pricing.
- Guest checkout, account, guest tracking and bilingual-ready EN/BN content fields.

## Payment
- Retail: COD or PayStation Hosted Checkout.
- Coupon engine.
- PayStation IPN verifies invoice, amount and idempotent transaction ID.
- bKash-specific 2% benefit is recorded only after PayStation verifies actual payment method; hosted checkout does not expose the channel before payment.
- Bulk: default 5% bulk discount + 50% advance via PayStation or bank; remaining amount courier COD.

## Courier
- Never auto-create courier order.
- Website order -> Pending Confirmation -> sales calls customer -> admin confirms -> admin chooses Steadfast/Pathao -> API order created -> tracking stored.

## Dealer
- Dealer self-registration with phone OTP support, application status, login/dashboard, orders, advance/outstanding and tracking.
- Dealer registration is optional for bulk price.
- Admin approval changes Pending to Active.

## Staff / CRM
- One Super Admin bootstrap account.
- Super Admin creates Admin/Sales/Inventory/Support staff from Admin panel; MongoDB stores accounts and audit logs.
- Registered customers including no-order users are CRM leads; activity includes product view, wishlist, cart, checkout and dealer/quantity intent.
- Dashboard first-party visitors, purchases, conversion, funnel, sales and CRM metrics.

## OTP
- Nishchit adapter. `nk_test_` mode is free and no handset is contacted; dev can expose generated OTP for testing.
- Live key sends real SMS.

## Content management
- Business content must remain database/CMS-driven: logo/favicon, hero/banner text/images, category order, featured products, prices, stock, colors, product media/features, footer/contact/policies and promotion visibility.
