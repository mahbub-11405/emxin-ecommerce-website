# EMXIN DuckDNS deployment checklist

Prefilled test domains:
- Frontend: https://emxin-dev.duckdns.org
- Admin: https://emxin-admin-dev.duckdns.org
- API: https://emxin-api-dev.duckdns.org

Before first build:
1. `cp .env.example .env`
2. Set a strong `APP_SECRET` and `INITIAL_ADMIN_PASSWORD`.
3. Paste the MongoDB Atlas M0 URI.
4. Create the S3 bucket and CloudFront distribution, then set `AWS_CLOUDFRONT_DOMAIN`, `AWS_CDN_BASE_URL`, and AWS credentials.
5. Add PayStation sandbox credentials when available and enable `PAYSTATION_ENABLED=true` only when ready to test.
6. Add Nishchit `nk_test_...` key and enable `NISHCHIT_ENABLED=true` for OTP integration tests.
7. Add Steadfast/Pathao merchant API credentials only when available; checkout never auto-dispatches orders.
8. Host Nginx and Certbot are managed manually on EC2 and are intentionally not included in this repository.

Start:
```bash
docker compose up -d --build
```

Loopback ports:
- Frontend: 127.0.0.1:4310
- Admin: 127.0.0.1:4320
- Backend: 127.0.0.1:8430
