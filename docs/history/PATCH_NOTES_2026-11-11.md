# EMXIN Product / Checkout Hotfix (development review)

Changes made in this patch:
- Add to Cart now stores/merges product/color/quantity in `emxin_cart` and navigates to `/cart`.
- Buy Now navigates directly to `/checkout` with the selected product, color and quantity.
- Quantity Request drawer remains exclusive to the Request Quantity action.
- Checkout preserves entered fields in sessionStorage while redirecting an unauthenticated customer to phone OTP login and returns to the checkout URL afterward.
- Orders endpoint now enforces authenticated customer identity and requires the order phone to match the verified customer phone. Checkout supplies the customer bearer token.
- Empty product features no longer render a misleading single huge feature tile.
- Admin product media upload shows a reminder that uploaded S3 URLs are not yet linked to a product until the product form is saved.

## Existing product image missing despite S3 upload
1. Open Admin > Products > Edit for the affected product.
2. Select multiple image files (Ctrl/Shift selection), click Upload files to S3, confirm all previews, then click **Update product**.
3. Verify `GET /api/v1/products/aimb-g2-pro` returns `images` with the expected CloudFront URLs.
4. `curl -I '<exact CloudFront URL>'` must return 200. A successful S3 upload alone does not update MongoDB.
5. Refresh the product page. No live data or S3 objects were modified by this package.

## Known limitations
- Not deployed or browser/E2E tested; npm dependencies were not installed in this workspace.
- Current admin supports multiple images and one video URL. A multi-video ordered gallery is not implemented.
- No new lifestyle promotional image asset was added.
- Existing customer token is stored in localStorage; production-grade cookie/session hardening is separate work.
- Backend order endpoint behavior changes: old unauthenticated checkout clients will now get HTTP 401. Deploy frontend and backend together.
- This patch is not a complete 21-feature production-ready release.
