# Integrations

## bKash
Direct merchant API credentials must come from EMXIN's bKash merchant/API onboarding. API base URL and endpoint paths are environment variables. The backend has a payment client and only initiates online payment when `BKASH_ENABLED=true`.

## Steadfast / Pathao
Provider credentials belong to the EMXIN merchant accounts. Orders are not pushed until an Admin confirms the customer and clicks Send to Courier. Courier response is stored on the order for tracking/reconciliation.

## Webhooks
Before enabling production webhooks, map provider signature verification using the merchant account's current documentation and secrets. Do not accept unverified settlement/status webhooks.
