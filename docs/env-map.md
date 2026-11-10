# Environment value map

| Variable | What to put there |
|---|---|
| FRONTEND_URL | Full customer site URL, e.g. `https://emxin-dev.duckdns.org` |
| ADMIN_URL | Full admin URL |
| BACKEND_PUBLIC_URL | Full API origin URL, no `/api/v1` suffix |
| NEXT_PUBLIC_API_URL | Backend URL **with** `/api/v1` |
| MONGODB_URI | Atlas M0 SRV string from Connect > Drivers |
| AWS_S3_BUCKET | Bucket name only |
| AWS_CLOUDFRONT_DOMAIN | Distribution host only (`dxxxx.cloudfront.net`) |
| AWS_CDN_BASE_URL | `https://` + CloudFront distribution host or future `https://cdn.yourdomain` |
| PAYSTATION_MERCHANT_ID / PASSWORD | Merchant credentials from PayStation |
| PAYSTATION_IPN_URL | Public HTTPS backend route `/api/v1/payments/paystation/ipn` |
| PAYSTATION_CALLBACK_URL | Customer-facing payment-result page URL |
| NISHCHIT_API_KEY | `nk_test_...` for test, `nk_live_...` for live |
| STEADFAST_* | Your Steadfast merchant API URL/credentials |
| PATHAO_* | Your Pathao merchant API URL/credentials |
