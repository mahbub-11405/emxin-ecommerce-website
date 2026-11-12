# EMXIN Hero + Branding correction

## Fixes
- Hero feature labels are no longer blurred by CSS mask or cropped by oversized image scaling. Default is **Show full image** (contain).
- Admin Hero Banner tab includes an image fit selector: contain / cover / seamless (for transparent assets). Setting is saved with CMS publish.
- Branding tab clearly exposes website logo upload (S3 presigned upload already implemented), with auto-saved CloudFront reference on Publish.
- Original supplied EMXIN wordmark is included as local light-header (navy/cyan) and dark-footer (white/cyan) fallback assets. Admin sidebar also uses the original brand mark.
- Existing root .env approach remains unchanged.

## Design limitation
An arbitrary JPG/PNG with a baked-in rectangular background cannot become perfectly seamless through CSS without affecting its embedded text. For perfect seamless blending, upload a transparent product-only PNG/WebP; add product features as HTML in a later CMS enhancement.

## Deployment
Back up existing project and database. Replace project files with this release, keeping root .env and existing DB. Rebuild frontend and admin. Backend CMS accepts the fit_mode key under hero without schema changes. Test S3 upload, publish, page refresh, both logo contexts, mobile view, and browser console.

## Validation
Python syntax check performed; Node/Next production build not guaranteed in this environment. Not a claim that other EMXIN features are production-tested.
