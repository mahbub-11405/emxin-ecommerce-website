# EMXIN E-commerce V1.1 locked scope

## Customer/storefront
White/minimal EMXIN storefront; dynamic categories/brands; Smart Glasses, Sunglasses, Frames and future categories; New Collection; featured products; category/brand filters; stock count; stock-out status; configurable colors; 3-6 images + short product video; quantity request; retail/bulk checkout; dealer application; guest tracking; customer account.

## Customer analytics / CRM
Anonymous first-party session analytics record useful commerce events only. Registered users are linked to their own activity. Admin Customers & CRM shows registered users, registered-no-order leads, total orders/purchase, lead status, lead priority, last active and recent events.

## Pricing/payment
Retail: COD or bKash. bKash retail discount defaults to 2%. Coupons supported. Dhaka delivery BDT 70; outside Dhaka BDT 130 for 1-5 pcs. 6+ pcs gets estimated shipping from configurable weight/rate. Bulk threshold defaults to 20 pcs, 5% discount, 50% advance; dealer membership optional. Bulk bank payments require manual verification; direct bKash uses merchant API when configured.

## Courier
No order is automatically dispatched. Website order -> Pending Confirmation -> EMXIN calls customer -> Admin confirms -> Admin clicks Send Steadfast/Pathao. Courier adapter receives only remaining COD due. Courier/tracking response is stored against the order.

## Dealer
Dealer registration from navigation or bulk/quantity request. Admin approval required. Dealer dashboard/order history supported. Dealer pricing configuration is separated from dealer membership so a non-dealer bulk buyer can still receive the configured bulk price.

## Admin
Dashboard analytics, Orders, Products, Quantity Requests, Dealers, Customers & CRM, Ledger, Homepage Builder and Settings. Business content should be stored in CMS/database rather than hardcoded wherever implemented.

## Deployment
Single EC2 Ubuntu 24.04 host; Docker Compose for Next.js frontend, Next.js admin, FastAPI; host Nginx + Certbot; MongoDB Atlas M0; S3-ready media; Cloudflare Free in front of EC2 EIP.
