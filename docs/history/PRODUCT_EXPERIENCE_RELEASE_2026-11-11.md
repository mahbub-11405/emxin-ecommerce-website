# EMXIN Product Experience Release — 2026-11-11

## Implemented in this source update

1. Admin Product Management now uploads multiple images and videos in one selection to the existing presigned S3 POST flow.
2. The Admin media gallery previews both media types and supports ordering and removal before saving the product.
3. Product documents persist a typed `media` array (`url`, `type`, optional `name`) while retaining legacy `images` and `video_url` fields for backward compatibility.
4. Storefront product gallery renders every `media` item, supports image/video thumbnails, and starts on the first image. Legacy product records continue to render from `images` and `video_url`.
5. Product detail layout has been rebuilt with a larger gallery, stock and pricing panel, responsive feature tiles, working information tabs, overview checklist and a fixed EMXIN lifestyle promotional image.
6. Promotional banner asset is bundled at `frontend/public/branding/emxin-see-more-do-more.png`.
7. Backend media URL generation now falls back to `AWS_CLOUDFRONT_DOMAIN` when `AWS_CDN_BASE_URL` is unset. This prevents newly uploaded private S3 objects from being stored as direct S3 URLs when the CloudFront domain is configured.

## Required production environment

Set these values in the existing root `.env` (do not create a second env file):

```dotenv
AWS_REGION=ap-south-1
AWS_S3_BUCKET=emxin-production-media-s3
AWS_S3_PREFIX=media
AWS_CLOUDFRONT_DOMAIN=d3qe2cl6n4i7xj.cloudfront.net
AWS_CDN_BASE_URL=https://d3qe2cl6n4i7xj.cloudfront.net
```

Keep AWS credentials in the server environment only. The CloudFront distribution must have OAC access to the bucket, and the bucket policy must allow `s3:GetObject` from that distribution ARN. Do not make the bucket public.

## Deployment steps

1. Back up the live source and database.
2. Merge the `emxin_patch/` source into the existing project; retain the existing root `.env` and persistent data volumes.
3. Confirm the four S3/CDN environment values above.
4. Rebuild/restart backend, frontend and admin services using the project's existing compose/deployment procedure.
5. In Admin > Products, edit a product, upload at least two images and one MP4/WebM video, reorder them, and click Update product.
6. Confirm the product API returns `media` with all uploaded objects and each CloudFront URL returns HTTP 200.
7. Open the product page: verify thumbnail selection, main image, video playback, all tabs, quantity request drawer, Add to Cart -> Cart and Buy Now -> Checkout.

## Verification status

- Python syntax compilation: passed.
- Product Pydantic schema validation with image + video records: passed.
- Source-level checks for media persistence/rendering and promotional asset: passed.
- Next.js production build: not run; npm dependency installation timed out in this execution environment (no local `node_modules`).
- Browser end-to-end against the user's deployed AWS environment: not run; no authenticated staging/browser session or runtime credentials were provided. This must be completed before production release.

## Notes

The bundled lifestyle banner is a generated EMXIN promotional asset. Replace it later through a CMS media field if the business wants a different campaign visual. Product media are per-product and remain managed through Admin > Products.
