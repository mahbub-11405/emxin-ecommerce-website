# EMXIN E-Commerce Monorepo

One Git repository, three independently buildable Docker services:

- `frontend` — customer storefront (`127.0.0.1:4310` by default)
- `admin` — staff/admin portal (`127.0.0.1:4320`)
- `backend` — FastAPI REST API (`127.0.0.1:8430`)

There is **no Nginx container and no Nginx configuration in this repository**. Production uses the Ubuntu host's Nginx + Certbot, managed manually outside Git.

## Environment strategy

The monorepo intentionally uses **one root `.env` file** on the EC2 host.

```bash
cp .env.example .env
nano .env
```

- `.env.example` = safe template committed to Git.
- `.env` = real production configuration and secrets; never commit it.
- Docker Compose reads the root `.env` automatically.
- Frontend/Admin receive only `NEXT_PUBLIC_*` values as Docker build arguments.
- Backend receives the private runtime variables through `env_file: ./.env`.

You do **not** need a separate `.env` inside `frontend/`, `admin/`, or `backend/` for the production Docker deployment in this project.

## First EC2 deployment

```bash
sudo mkdir -p /var/www/emxin-platform
sudo chown -R $USER:$USER /var/www/emxin-platform
git clone <YOUR_GITHUB_REPO> /var/www/emxin-platform
cd /var/www/emxin-platform
cp .env.example .env
nano .env
sudo docker compose up -d --build
sudo docker compose ps
```

After the containers are healthy, configure the **host** Nginx manually:

- storefront domain -> `http://127.0.0.1:4310`
- admin domain -> `http://127.0.0.1:4320`
- API domain -> `http://127.0.0.1:8430`

Then issue SSL certificates using host Certbot.

## Independent deployment

```bash
git pull
sudo docker compose up -d --build frontend
# or: admin / backend
```

All services:

```bash
git pull
sudo docker compose up -d --build
```

## Media architecture

Logo, favicon, hero banners, category thumbnails, product images/videos and other business media are stored in S3 and delivered through CloudFront. Admin obtains a presigned upload from the backend; MongoDB stores the resulting CloudFront URL, not the image bytes.

## Payment architecture

- Retail COD: no digital-payment discount.
- Retail PayStation: configured digital discount (default 2%) for any successfully verified digital PayStation payment.
- Bulk/dealer: separate bulk discount + configured advance percentage; retail digital discount does not stack.
- PayStation settlement account must be configured/approved in the PayStation merchant profile.

## Courier architecture

Courier dispatch is intentionally manual-confirmation based:

`Order -> Pending Confirmation -> Admin calls customer -> Admin confirms -> Create Steadfast/Pathao consignment`

Checkout/payment alone never creates a courier order.

## OTP

SMS goes through **BulkSMSBD** (`BULKSMSBD_API_KEY`, `BULKSMSBD_SENDER_ID`, `BULKSMSBD_API_URL`). Check it with Admin → Settings → SMS / OTP → *Send test SMS*.

- Message: `OTP_SMS_TEMPLATE` — plain English/ASCII so each OTP is 1 normal SMS (no ৳, emoji or curly quotes). The last line `@{DOMAIN} #{OTP}` lets Android Chrome / iPhone auto-fill the code.
- Limits: 1 send per 60 s per number, 5 per number per hour, 15 per IP per hour, 300 per day (all configurable). Every resend costs 1 SMS.
- Verify: 5 wrong codes → a new code is needed; codes expire after 5 minutes; only an HMAC-SHA256 hash of the code is stored.
- Development without a key: set `APP_ENV=development` and `OTP_EXPOSE_CODE_IN_TEST=true` to see the code on screen. With `APP_ENV=production` the key is required.

## Admin staff

One bootstrap Super Admin is created from `.env` if no Super Admin exists. Super Admin can create staff users with roles such as `admin`, `sales`, `inventory`, and `support`; staff accounts and audit events are stored in MongoDB.

## Before live launch

1. Replace every `YOUR_*` placeholder in `.env`.
2. Generate a strong `APP_SECRET` and strong initial Super Admin password.
3. Configure MongoDB Atlas network access and DB credentials.
4. Create private S3 bucket + CloudFront distribution/OAC + least-privilege IAM credentials.
5. Test PayStation sandbox end-to-end before switching to live credentials.
6. Add the BulkSMSBD API key + sender ID and send a test SMS from Admin → Settings → SMS / OTP.
7. Add/test Steadfast and/or Pathao merchant API credentials.
8. Configure host Nginx and Certbot manually.
9. Run one complete test order lifecycle including payment, confirmation, courier, ledger and tracking before production launch.
