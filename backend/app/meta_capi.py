"""Facebook / Meta Conversions API: tells Facebook about each website order from the server.

The browser Pixel also sends a Purchase with the same event_id (the order ID), so Facebook counts the order once.
Orders blocked in the browser (ad-blockers, iPhone tracking limits) are still counted from here.
Personal data is SHA-256 hashed before it leaves the server, as Meta requires. Nothing is sent unless both a
Pixel ID and META_CAPI_TOKEN are set. A failure never affects the order; the result is saved on the order (meta_capi).
"""
import hashlib, logging, re
import httpx
from .config import get_settings
from .db import db
from .helpers import now
from .clientip import real_ip

log = logging.getLogger('emxin.meta')
GRAPH = 'https://graph.facebook.com/v21.0'


def pixel_id() -> str:
    """Admin → Homepage Builder → Facebook ads wins; the backend .env META_PIXEL_ID is the fallback."""
    t = (db.homepage.find_one({'key': 'home'}, {'tracking': 1}) or {}).get('tracking') or {}
    pid = str(t.get('meta_pixel_id') or get_settings().meta_pixel_id or '').strip()
    return pid if re.fullmatch(r'\d{5,20}', pid) else ''


def enabled() -> bool:
    return bool(pixel_id() and get_settings().meta_capi_token)


def _h(v) -> str | None:
    v = str(v or '').strip().lower()
    return hashlib.sha256(v.encode()).hexdigest() if v else None


def client_ip(request) -> str | None:
    if request is None: return None
    return real_ip(request) or None


def purchase_event(o: dict, ip: str | None, ua: str | None, fbp: str | None, fbc: str | None, url: str | None) -> dict:
    s = get_settings()
    phone = re.sub(r'\D', '', o.get('phone') or '')
    if phone.startswith('01'): phone = '88' + phone
    names = [w for w in re.sub(r'[^\w\s]', ' ', o.get('customer_name') or '').split() if w.lower() not in ('md', 'mohammad', 'muhammad', 'mohammed', 'mst', 'mrs', 'mr', 'ms')]
    user = {'ph': [_h(phone)] if phone else None, 'em': [_h(o.get('email'))] if o.get('email') else None,
            'fn': [_h(names[0])] if names else None, 'ln': [_h(names[-1])] if len(names) > 1 else None,
            'ct': [_h(re.sub(r'[^a-z]', '', (o.get('district') or '').lower()))] if o.get('district') else None,
            'country': [_h('bd')], 'external_id': [_h(o.get('customer_id'))] if o.get('customer_id') else None,
            'client_ip_address': ip, 'client_user_agent': ua, 'fbp': fbp, 'fbc': fbc}
    items = o.get('items') or []
    p = o.get('pricing') or {}
    return {'event_name': 'Purchase', 'event_time': int(o['created_at'].timestamp()), 'event_id': o['order_id'],
            'action_source': 'website', 'event_source_url': url or f"{s.frontend_url.rstrip('/')}/checkout",
            'user_data': {k: v for k, v in user.items() if v},
            'custom_data': {'currency': 'BDT', 'value': float(p.get('grand_total') or 0), 'order_id': o['order_id'],
                            'content_type': 'product', 'content_ids': [i['product_id'] for i in items],
                            'contents': [{'id': i['product_id'], 'quantity': i['quantity'], 'item_price': i.get('unit_price')} for i in items],
                            'num_items': sum(int(i.get('quantity') or 0) for i in items)}}


async def send_purchase(o: dict, ip: str | None, ua: str | None, fbp: str | None, fbc: str | None, url: str | None):
    """Runs after the order is saved (FastAPI background task)."""
    pid = pixel_id(); s = get_settings()
    if not (pid and s.meta_capi_token): return
    body = {'data': [purchase_event(o, ip, ua, fbp, fbc, url)]}
    if s.meta_test_event_code: body['test_event_code'] = s.meta_test_event_code
    result = {'at': now(), 'sent': False}
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f'{GRAPH}/{pid}/events', params={'access_token': s.meta_capi_token}, json=body)
        j = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
        result['sent'] = r.status_code == 200 and bool(j.get('events_received'))
        if not result['sent']: result['error'] = str((j.get('error') or {}).get('message') or r.text)[:300]
    except Exception as e:  # never break checkout because of Facebook
        result['error'] = str(e)[:300]
    if not result['sent']: log.warning('Meta CAPI Purchase %s not sent: %s', o['order_id'], result.get('error'))
    db.orders.update_one({'order_id': o['order_id']}, {'$set': {'meta_capi': result}})
