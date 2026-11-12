# EMXIN v2.0 — Template build (2026-11-12, final for staging)

## Update 3 — staff roles & full admin control
- **Staff accounts** (Settings → Staff Accounts, Super Admin only): create staff with a role (Admin, Sales, Marketing, Inventory, Support), edit name/phone/role, reset password, disable/enable. New accounts must set their own password at first sign-in. Everyone can change their password from the profile menu (*Change password*).
- **Role-based access**, enforced in the API and reflected in the sidebar:
  - Admin: everything except staff accounts and the audit log.
  - Sales: orders, customers, quantity requests, dealers, payments, reports.
  - Marketing: CMS/homepage, Media Library, coupons, SMS campaigns, reviews, customers, reports.
  - Inventory: products, categories, brands, Media Library; can view orders.
  - Support: orders, customers, quantity requests, reviews.
- The **Super Admin** is created once from `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` in `.env` on first start. Later changes to `.env` don't change that account; use *Change password*.
- **Logout**: one in the sidebar, plus the profile menu. The duplicate top-bar button was removed.
- More of the site is now editable in Admin:
  - Dealer discount tiers (Settings → Dealer & Discounts), used both on the Become a Dealer page and in order pricing.
  - SEO title, description and share image (CMS → Trust, Video & Extras).
- Fixed: the announcement bar, footer tagline and SEO set in the CMS were not sent to the website (`/site-content` now returns them).


## Update 2 — requested fixes
- **Customer registration by mobile number + OTP only.** The login page has **Login** and **Register** tabs. Login works only for registered numbers; Register works only for new ones, and the page switches tab automatically if the number is in the other state. `/register` opens the Register tab.
- **Shopping flow:** Add to Cart (product page and the + button on cards) → **Cart** → Checkout. Guests fill in their details, then press *Continue — verify mobile* and are sent to Register. After the OTP they **come straight back to checkout with everything still filled in** (cart, name, phone, address, district, payment choice, coupon).
- **Payments through PayStation only** (bKash, Nagad, Rocket, Upay, Visa, Mastercard, AMEX, internet banking) or Cash on Delivery. The manual bank-transfer option was removed from checkout. **The 2% digital discount now applies to every online payment, including bulk orders.** It is shown on the payment option ("You save ৳111"), in the order summary, and on the pay button ("Pay ৳5,458 securely").
- **PayStation integration fixed to match their documentation:**
  - Amounts are sent as whole numbers (the API requires an integer).
  - Each retry uses a unique invoice number.
  - New `/payment-result` page for PayStation to return customers to. Payment is confirmed server-to-server via `transaction-status` (`trx_status=success` and the amount must match) before the order is marked Paid or Advance Paid. A ledger entry is written.
  - Customers can *Try again* / *Pay now* from My Account, and can switch a COD order to online payment to save 2%.
- **All images and videos come from S3/CloudFront.** Admin uploads go directly from the desktop to S3, with drag & drop, multiple files at once (3 in parallel), and progress bars. Limits: images 15 MB, videos 300 MB, enforced by S3 itself.
  - New **Media Library** page: browse, copy the CloudFront URL, or delete (blocked while a file is in use).
  - *From library* picker in every image field and in the product gallery.
  - Hero *Watch Video*, logos, favicon and the default product banner are all uploadable.
- **Admin Logout:** in the sidebar, the top bar, and the profile menu.
- **My Account:** Logout button, edit profile (name, email, default address), and Pay now on unpaid orders.
- Fixed a database index bug that would have blocked the 2nd customer (or dealer) who registers without an email.
- **Preview correction:** the dealer-form picture in the earlier hero preview was a cropping mistake in my sample data only. The live site shows the hero image you upload in Admin → CMS / Homepage → Hero.

**PayStation setup:** set `PAYSTATION_ENABLED=true`, `PAYSTATION_MERCHANT_ID`, `PAYSTATION_PASSWORD`, and `PAYSTATION_CALLBACK_URL=https://<your-store-domain>/payment-result` in `.env`, then rebuild the backend. Test with the sandbox (`PAYSTATION_ENV=sandbox`) first.


This release rebuilds the storefront and admin panel to match the approved design templates and gives the admin panel control over the whole store.

## What changed

### Storefront (`frontend/`)
- **Header**: logo, Home / Shop / Explore Categories (mega menu with category images) / New Collection / Offers, blue *Become a Dealer* pill, rounded search, Track Order, Account, wishlist, cart with live item count, mobile hamburger menu.
- **Homepage** (all blocks editable + re-orderable + hideable from Admin → CMS):
  hero (pill, two-tone headline, CTA, product image, floating product tag, *Watch Video* modal) → trust row → **Shop by Category** tiles → **Featured Products / New Collection** cards (Featured / New / Hot badges, price `৳ 5,499/-`, stars, blue + add-to-cart, wishlist heart) → **Our Smart Products** + *More Gadgets Coming Soon* card → *Experience the Future with EMXIN* banner.
- **Product page**: vertical thumbnails + video, *New Collection* badge, full-screen zoom, rating / sold / brand / model / SKU, sale price with `% OFF`, green stock bar, 5 auto-icon feature cards, colour swatches, quantity stepper, Add to Cart / Buy Now / wishlist, **Order 20+ pcs? dealer banner**, assurance row, tabs (Details, Specifications, What's in the Box, **Reviews**, **Q&A**).
- **Quantity Request drawer**: same layout as the template, including the BD +880 phone input, total + per-colour steppers, dealer opt-in with live dealer price, Normal / Priority / Urgent cards, and validation.
- **Shop**: working filters (category, brand, camera, availability, price range), sorting, `/offers` and `/new-collection`.
- **Cart, Checkout** (district list, coupon validation, live estimate, payment option cards, success screen), **Track Order** (progress steps).
- Real reviews and Q&A: customers submit, admin approves. Ratings shown on the site are computed only from approved reviews.

### Admin (`admin/`)
- Shell from the template: dark sidebar with icons, pending-order badge, collapsible groups, global search (Ctrl+K) across orders/customers/products/dealers, notifications bell, profile menu.
- **Dashboard**: Today / Yesterday / 7 / 30 days / Custom; KPI cards with % change + sparklines; Visitors vs Purchases chart (2-hour buckets for a single day, daily otherwise); funnel ("at a Glance"); payment-method donut; 4-period summary; recent orders; low-stock alerts; auto refresh every 60 s.
- **Orders**: status tabs with counts, search/filters/date range, CSV export, detail drawer (customer, items, price breakdown, timeline), *Customer confirmed* → *Send to Steadfast / Pathao*, manual payment verification (bKash/Nagad/bank TrxID), any status change, notes, printable invoice.
- **Products**: table with stock adjust (+/− with reason log), duplicate, delete (hides the product if it has orders); editor with tabs for Basics, Media (multi-upload to S3, reorder, cover), Content (features, checklist, specs, box, FAQ, Bangla), Display (status, badge, featured/new, camera flag, sort order, colours + hex).
- **Categories, Brands, Coupons** (full CRUD, images, usage limits, dates, min order), **Customers & CRM** (lead status/priority, assignee, follow-up date, notes, activity), **Quantity Requests** (status pipeline + notes), **Dealers** (approve/reject/suspend with SMS, tier or fixed discount, dealer leads), **Reviews & Q&A**, **Marketing** (SMS campaigns to segments + outbox dispatch), **Reports** (sales/orders charts, best sellers, districts, status split, inventory value, CSV), **Payments**, **Ledger**, **Audit Log**, plus the existing Settings, Staff and Homepage Builder (now with Sections, Trust row, Video, Coming Soon, Announcement bar, contact links, favicon, footer logo).

### Backend (`backend/`)
- New `app/admin_ext.py` router (≈40 endpoints) covering everything above, with role permissions (super_admin / admin / sales / inventory / support).
- Bug fixes in existing code:
  - `MongoClient(tz_aware=True)`. Without it, **OTP verify and coupon date checks crashed** because naive and aware datetimes were being compared.
  - Phone numbers are now normalised on orders, so Track Order works whatever format the customer types.
  - Cancelling an order can no longer release stock twice.
  - Coupons now enforce `usage_limit` and `min_order`, and an invalid code is rejected at checkout instead of being silently ignored.
  - Product slugs are unique.
  - Quantity requests validate colours and totals.
- `seed.py` loads the template's 4 products, 3 categories and brands. It never overwrites data you have edited.

## Deploy (EC2)
```bash
cd /var/www/emxin-platform
# replace the code with this release (keep your existing .env)
sudo docker compose up -d --build
sudo docker compose exec backend python -m app.seed      # first time only
```
Then in Admin:
1. Upload category tile images (Categories). Transparent PNGs look best.
2. Upload product photos and the video (Products → Media).
3. Upload the hero image and set the hero video URL (CMS / Homepage → Hero, and Trust, Video & Extras).
4. Publish the homepage.

**S3 CORS** must allow `POST` from your admin origin (for example `https://admin-emxin-dev.duckdns.org`) for uploads to work.

## Verified in this release
- Every page in both apps compiles with esbuild (React 19). Python compiles.
- Storefront pages and the admin dashboard, orders, and products screens were rendered with mock data and compared against the template screenshots at 1440/1600 px and 390 px (mobile).
- Dashboard date-range and bucketing logic was unit-tested.

## Not verified — please test on staging first
- `next build` / `npm install`: the build environment had no network access. The Docker build on EC2 runs them; fix any type error it reports.
- Live MongoDB, S3/CloudFront uploads, PayStation, Nishchit SMS, Steadfast/Pathao were not exercised.
- Return-policy wording: the trust row says *7 Days Return · Hassle Free* (as in the template). Make sure your Return Policy page says the same, or edit the trust row in Admin.
- Ratings and "sold" counts start at 0 and grow from real approved reviews and delivered orders. The template's 4.9 (128) / 356 Sold were sample figures.
