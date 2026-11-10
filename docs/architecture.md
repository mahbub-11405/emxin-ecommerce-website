# Architecture

```text
Cloudflare Free (DNS/proxy)
          |
       EC2 EIP
          |
Host Nginx + Certbot
  |        |        |
:3000    :3001    :8000
Frontend  Admin    FastAPI REST
                    |    \
             MongoDB M0   S3
                    |
       bKash / Steadfast / Pathao adapters
```

## Order dispatch rule

Website order does not create a courier consignment automatically. It remains `Pending Confirmation`. EMXIN calls the customer; Admin presses Confirm, then `Send Steadfast` or `Send Pathao`.

## Retail payment

COD or direct bKash. Retail bKash discount default 2%. Coupons supported. Flat delivery 1-5 units: Dhaka 70 / outside Dhaka 130. At 6+ units estimated shipping is added from configurable weight rules.

## Bulk/dealer

20+ total units triggers bulk price (default 5% discount) whether buyer becomes a Dealer or not. Default 50% advance, remaining amount becomes courier COD. Dealer registration is optional. Approved Dealer account sees order/payment/tracking history.

## Stock

Stock is visible publicly. Zero stock displays STOCK OUT. Quantity request captures business name, phone, quantities by available color, urgency and optional dealer opt-in. Admin sees Urgent first.
