"""Homepage Builder version history that people can read.

Each Publish saves the homepage AS IT WAS PUBLISHED, with who published it and what changed
("Hero banner: title, image · Logos & favicon"). Publishing without changes adds nothing.
Restore brings that exact version back (and is itself saved as a new version).
Only the last 7 days are kept in the list; older versions move to the Recycle Bin (they can be restored from there).
"""
from datetime import timedelta, timezone
from bson import ObjectId
from .db import db
from .helpers import now

KEEP_DAYS = 7
SECTION = {'hero': 'Hero banner', 'promo': 'Promotion', 'branding': 'Logos & favicon', 'links': 'Contact & social links',
           'policies': 'Policy pages', 'trust': 'Trust badges', 'dealer_benefits': 'Dealer benefits', 'footer': 'Footer',
           'announcement': 'Announcement bar', 'banner': 'Banner', 'sections': 'Section order', 'hidden_sections': 'Hidden sections',
           'category_section': 'Category section', 'featured_section': 'Featured products', 'smart_section': 'Smart section',
           'seo': 'SEO (Google)', 'tracking': 'Facebook ads (Pixel)', 'product_sort': 'Product order', 'coming_soon': 'Coming soon'}
FIELD = {'logo_url': 'header logo', 'logo_dark_url': 'footer logo', 'favicon_url': 'site icon', 'product_banner_url': 'product banner',
         'image': 'image', 'title': 'title', 'subtitle': 'subtitle', 'text': 'text', 'href': 'link', 'enabled': 'on/off',
         'meta_pixel_id': 'Pixel ID', 'google_verification': 'Google verification', 'keywords': 'keywords', 'description': 'description'}


def actor_name(actor: dict) -> str:
    try: oid = ObjectId(actor.get('sub'))
    except Exception: oid = None
    doc = (db.admins.find_one({'_id': oid}, {'name': 1, 'email': 1}) or db.staff.find_one({'_id': oid}, {'name': 1, 'email': 1})) if oid else None
    return (doc or {}).get('name') or (doc or {}).get('email') or ('Super Admin' if actor.get('role') == 'super_admin' else 'Staff')


def changes(before: dict, after: dict) -> list[str]:
    """Human list of what differs, e.g. ['Hero banner: title, image', 'Logos & favicon: site icon']."""
    out = []
    for k, label in SECTION.items():
        if k not in after or before.get(k) == after.get(k): continue
        a, b = before.get(k), after.get(k)
        if isinstance(a, dict) or isinstance(b, dict):
            a, b = a if isinstance(a, dict) else {}, b if isinstance(b, dict) else {}
            keys = [f for f in dict.fromkeys(list(a) + list(b)) if a.get(f) != b.get(f) and f != 'updated_at']
            names = [FIELD.get(f, f.replace('_url', '').replace('_', ' ').replace('-', ' ')) for f in keys]  # policies: 'return-policy' -> 'return policy'
            more = f' +{len(names) - 4}' if len(names) > 4 else ''
            out.append(f"{label}: {', '.join(names[:4])}{more}" if names else label)
        else:
            out.append(label)
    return out


def _clean(d: dict) -> dict:
    return {k: v for k, v in (d or {}).items() if k not in ('_id', 'key', 'updated_at')}


def save_version(before: dict, after: dict, actor: dict, action: str = 'publish', note: str = '') -> list[str]:
    """after = the homepage as it is now live. Returns the change list (empty = nothing saved)."""
    ch = changes(_clean(before), _clean(after))
    if action == 'publish' and not ch: return []
    db.cms_versions.insert_one({'snapshot': _clean(after), 'created_at': now(), 'action': action, 'by': actor.get('sub'), 'by_role': actor.get('role'),
                                'by_name': actor_name(actor), 'changes': ch or ['No visible change'], 'note': note[:120]})
    prune(actor)
    return ch


def prune(actor: dict | None = None):
    """Versions older than KEEP_DAYS go to the Recycle Bin (a version restored from the bin is kept 7 more days)."""
    from .recycle import move_to_bin
    who = actor or {'sub': 'system', 'role': 'system'}
    cut = now() - timedelta(days=KEEP_DAYS)
    for v in list(db.cms_versions.find({'created_at': {'$lt': cut}, '$or': [{'keep_until': {'$exists': False}}, {'keep_until': {'$lt': now()}}]}).limit(200)):
        t = v['created_at'].replace(tzinfo=v['created_at'].tzinfo or timezone.utc) + timedelta(hours=6)  # Bangladesh time
        when = t.strftime('%d %b %Y, %I:%M %p').replace(' 0', ' ')
        label = f"Homepage version · {when}"
        sub = (v.get('by_name') or 'older format') + ' · ' + ' · '.join(v.get('changes') or [str(v.get('action', '')).replace('_', ' ')])
        move_to_bin('cms_version', 'cms_versions', v, who, label, sub[:300])
