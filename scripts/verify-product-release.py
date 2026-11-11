from pathlib import Path
import ast
root = Path(__file__).resolve().parents[1]
for rel in ('backend/app/main.py', 'backend/app/schemas.py'):
    ast.parse((root / rel).read_text())
admin = (root / 'admin/src/app/products/page.tsx').read_text()
product = (root / 'frontend/src/app/product/[slug]/ProductDetails.tsx').read_text()
main = (root / 'backend/app/main.py').read_text()
checks = {
    'multi-file admin selection': 'multiple accept="image/*,video/mp4,video/webm,video/quicktime"' in admin,
    'media array saved in admin form': 'media,images:media.filter' in admin,
    'image and video rendering': "active?.type==='video'?<video" in product and "active?<img" in product,
    'legacy image fallback': 'p.images||[]' in product,
    'CloudFront domain fallback': "settings.aws_cloudfront_domain" in main,
    'fixed lifestyle image bundled': (root / 'frontend/public/branding/emxin-see-more-do-more.png').is_file(),
    'tabs present': all(x in product for x in ['Specifications', "What's in the Box", 'Reviews', 'Q&A']),
}
for label, ok in checks.items():
    print(('PASS' if ok else 'FAIL') + ': ' + label)
if not all(checks.values()):
    raise SystemExit(1)
