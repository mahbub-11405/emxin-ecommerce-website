"""Telegram alerts for the EMXIN team: new orders, payments, cancellations, low stock, dealer applications, requests, reviews.

The bot token lives ONLY in the server .env (TELEGRAM_BOT_TOKEN). Admin → Settings → Telegram alerts keeps the chats
(a person or a group) and which events are sent. Every alert is written to db.tg_outbox with a unique key (the same event
is never sent twice), then a background thread sends it within a second and retries failures. Sending never slows down
or breaks an order. Messages carry name, phone, district and money, never the full address.
"""
import html, logging, re, threading, time
from datetime import timedelta
import httpx
from fastapi import APIRouter, Header, HTTPException
from pymongo import ReturnDocument
from .config import get_settings
from .db import db
from .helpers import now
from .security import require_role

log = logging.getLogger('emxin.telegram')
router = APIRouter()
API = 'https://api.telegram.org'
MAX_TRIES = 4

EVENTS = {  # key: (label in admin, on by default)
    'order_new': ('New order', True),
    'payment_trx': ('bKash / Nagad TrxID sent (to verify)', True),
    'payment_online': ('Online payment received (PayStation)', True),
    'order_cancelled': ('Customer cancelled an order', True),
    'low_stock': ('Low stock after an order', True),
    'dealer_applied': ('New dealer application', True),
    'quantity_request': ('Quantity request (20+ pcs)', True),
    'checkout_abandoned': ('Left checkout without ordering (call them)', True),
    'review': ('New review to approve', False),
    'question': ('New product question', False),
}


def token() -> str:
    return (get_settings().telegram_bot_token or '').strip()


def config() -> dict:
    c = db.settings.find_one({'key': 'telegram'}, {'_id': 0}) or {}
    ev = {k: bool((c.get('events') or {}).get(k, d)) for k, (_, d) in EVENTS.items()}
    return {'chats': c.get('chats') or [], 'events': ev, 'low_stock': int(c.get('low_stock') if c.get('low_stock') is not None else 3), 'enabled': c.get('enabled', True) is not False}


def _mask(s: str) -> str:
    t = token()
    return str(s).replace(t, '***') if t else str(s)


def _call(method: str, **payload) -> dict:
    if not token(): raise RuntimeError('TELEGRAM_BOT_TOKEN is not set in the server .env')
    r = httpx.post(f'{API}/bot{token()}/{method}', json=payload, timeout=15)
    j = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    if not j.get('ok'): raise RuntimeError(_mask(j.get('description') or r.text[:200]))
    return j.get('result')


# ---------- text helpers ----------
e = lambda s: html.escape(str(s if s is not None else ''), quote=False)
def tk(n) -> str: return '৳ ' + f"{float(n or 0):,.0f}"
def admin_link(path: str) -> str: return get_settings().admin_url.rstrip('/') + path
PAY = {'cod': 'Cash on Delivery', 'manual': 'Send Money', 'paystation': 'Online (PayStation)', 'bank': 'Bank transfer'}


def items_text(o: dict, limit: int = 8) -> str:
    rows = [f"• {e(i.get('name'))} × {i.get('quantity')}{(' (' + e(i.get('frame_color')) + ')') if i.get('frame_color') else ''} — {tk((i.get('unit_price') or 0) * (i.get('quantity') or 0))}" for i in (o.get('items') or [])[:limit]]
    more = len(o.get('items') or []) - limit
    return '\n'.join(rows) + (f'\n• +{more} more' if more > 0 else '')


def who(o: dict) -> str:
    return f"{e(o.get('customer_name'))} · <code>{e(o.get('phone'))}</code> · {e(o.get('district'))}"


# ---------- queue + sender ----------
def notify(event: str, key: str, text: str, link: str = '', button: str = 'Open in Admin') -> bool:
    """Queues one alert for every chat (ignored if this key was already queued). Never raises."""
    try:
        c = config()
        if not token() or not c['enabled'] or not c['chats'] or not c['events'].get(event, False): return False
        r = db.tg_outbox.update_one({'key': key}, {'$setOnInsert': {'key': key, 'event': event, 'text': text[:3900], 'link': link, 'button': button,
                                                                      'chats': [str(x['id']) for x in c['chats']], 'done': [], 'status': 'pending', 'tries': 0, 'created_at': now()}}, upsert=True)
        if r.upserted_id: _wake.set(); start_worker()
        return bool(r.upserted_id)
    except Exception:
        log.exception('telegram queue failed'); return False


def _send(item: dict) -> bool:
    done = list(item.get('done') or []); err = ''
    for chat in item['chats']:
        if chat in done: continue
        body = {'chat_id': chat, 'text': item['text'], 'parse_mode': 'HTML', 'disable_web_page_preview': True}
        if item.get('link', '').startswith('https://'):  # Telegram buttons need a public https address
            body['reply_markup'] = {'inline_keyboard': [[{'text': item.get('button') or 'Open', 'url': item['link']}]]}
        elif item.get('link'):
            body['text'] += f"\n{e(item['link'])}"
        try: _call('sendMessage', **body); done.append(chat)
        except Exception as x: err = str(x)[:250]
    ok = len(done) == len(item['chats'])
    tries = int(item.get('tries', 0))
    st = 'sent' if ok else ('failed' if tries >= MAX_TRIES else 'retry')
    db.tg_outbox.update_one({'_id': item['_id']}, {'$set': {'done': done, 'status': st, 'error': err, 'sent_at': now() if ok else None, 'next_try_at': now() + timedelta(seconds=30 * tries)}})
    if not ok: log.warning('telegram %s not sent (%s/%s): %s', item.get('key'), tries, MAX_TRIES, err)
    return ok


def dispatch(limit: int = 30):
    # alerts older than 12 h are stale (e.g. the token was missing for a day): mark them, never send them late
    db.tg_outbox.update_many({'status': {'$in': ['pending', 'retry']}, 'created_at': {'$lt': now() - timedelta(hours=12)}}, {'$set': {'status': 'expired'}})
    for _ in range(limit):
        item = db.tg_outbox.find_one_and_update({'status': {'$in': ['pending', 'retry']}, '$or': [{'next_try_at': {'$exists': False}}, {'next_try_at': None}, {'next_try_at': {'$lte': now()}}]},
                                                {'$set': {'status': 'sending', 'last_attempt_at': now()}, '$inc': {'tries': 1}}, sort=[('created_at', 1)], return_document=ReturnDocument.AFTER)
        if not item: break
        _send(item)


_wake = threading.Event(); _started = False
def _loop():
    db.tg_outbox.update_many({'status': 'sending', 'last_attempt_at': {'$lt': now() - timedelta(minutes=5)}}, {'$set': {'status': 'retry'}})
    while True:
        try: dispatch()
        except Exception: log.exception('telegram worker error')
        _wake.wait(30); _wake.clear(); time.sleep(0.3)
def start_worker():
    global _started
    if _started or not token(): return
    _started = True; threading.Thread(target=_loop, name='telegram-alerts', daemon=True).start()


# ---------- the alerts ----------
def order_new(o: dict):
    p = o.get('pricing') or {}; mp = o.get('manual_payment') or {}
    pay = PAY.get(o.get('payment_method'), o.get('payment_method') or '')
    if mp: pay += f" · {e(mp.get('channel_label') or mp.get('channel'))} TrxID <code>{e(mp.get('trx_id'))}</code> (verify)"
    lines = [f"🛒 <b>New order {e(o['order_id'])}</b>", who(o), '', items_text(o), '',
             f"<b>Total {tk(p.get('grand_total'))}</b> · {pay}"]
    if p.get('is_bulk'): lines.append(f"Dealer / bulk order · advance {tk(p.get('advance_required'))}")
    if o.get('coupon_code'): lines.append(f"Coupon {e(o['coupon_code'])} (−{tk(p.get('coupon_discount'))})")
    if o.get('shop_name'): lines.append(f"Shop: {e(o['shop_name'])}")
    notify('order_new', 'order-new-' + o['order_id'], '\n'.join(lines), admin_link(f"/orders?open={o['order_id']}"))


def payment_trx(o: dict):
    mp = o.get('manual_payment') or {}
    text = (f"💳 <b>TrxID to verify · {e(o['order_id'])}</b>\n{who(o)}\n{e(mp.get('channel_label') or mp.get('channel'))} TrxID <code>{e(mp.get('trx_id'))}</code>"
            f" from <code>{e(mp.get('sender') or mp.get('sender_number') or '—')}</code>\nAmount {tk(mp.get('amount_expected'))}")
    notify('payment_trx', f"trx-{o['order_id']}-{mp.get('trx_id')}", text, admin_link(f"/orders?open={o['order_id']}"))


def payment_online(o: dict, amount, method: str = ''):
    text = f"✅ <b>Paid online · {e(o['order_id'])}</b>\n{who(o)}\n{tk(amount)}{(' by ' + e(method)) if method else ''} (PayStation verified)"
    notify('payment_online', f"paid-{o['order_id']}-{int(float(amount or 0))}", text, admin_link(f"/orders?open={o['order_id']}"))


def order_cancelled(o: dict, reason: str = ''):
    text = f"❌ <b>Customer cancelled {e(o['order_id'])}</b>\n{who(o)}\nTotal {tk((o.get('pricing') or {}).get('grand_total'))}" + (f"\nReason: {e(reason)}" if reason else '')
    notify('order_cancelled', 'cancel-' + o['order_id'], text, admin_link(f"/orders?open={o['order_id']}"))


def low_stock(before: dict, ordered: int):
    """Called after an order took `ordered` pieces; alerts once when the stock crosses the limit (and again at 0)."""
    try:
        limit = config()['low_stock']; was = int(before.get('stock') or 0); left = was - int(ordered)
        if left > limit or was <= 0: return
        if not (was > limit or (left <= 0 < was)): return
        text = (f"📦 <b>{'Out of stock' if left <= 0 else 'Low stock'}: {e(before.get('name'))}</b>\n"
                f"{'Nothing left' if left <= 0 else f'Only {left} pcs left'} after the last order. Restock soon.")
        notify('low_stock', f"stock-{before['_id']}-{'out' if left <= 0 else 'low'}-{now().strftime('%y%m%d%H')}", text, admin_link('/products'), 'Open Products')
    except Exception: log.exception('low stock alert')


def dealer_applied(d: dict, again: bool = False):
    text = (f"🤝 <b>Dealer application{' (again)' if again else ''}</b>\n{e(d.get('name'))} · <code>{e(d.get('phone'))}</code>\n"
            f"Shop: {e(d.get('shop_name'))}{(' · ' + e(d.get('district'))) if d.get('district') else ''}")
    notify('dealer_applied', f"dealer-{d.get('_id')}-{d.get('applications') or 1}", text, admin_link('/dealers'), 'Open Dealers')


def quantity_request(q: dict):
    text = (f"📋 <b>Quantity request: {e(q.get('product_name'))} × {q.get('total_quantity')} pcs</b>\n{e(q.get('name'))} · <code>{e(q.get('phone'))}</code>"
            + (f"\nShop: {e(q.get('shop_name'))}" if q.get('shop_name') else ''))
    notify('quantity_request', f"qr-{q.get('_id')}", text, admin_link('/quantity-requests'), 'Open requests')


def checkout_abandoned(d: dict):
    items = '\n'.join(f"• {e(i.get('name'))} × {i.get('quantity')} — {tk((i.get('unit_price') or 0) * (i.get('quantity') or 0))}" for i in (d.get('items') or [])[:6])
    text = (f"🛒⏳ <b>Left checkout without ordering</b>\n{e(d.get('name') or 'No name')} · <code>{e(d.get('phone'))}</code>{(' · ' + e(d.get('district'))) if d.get('district') else ''}\n\n"
            f"{items}\n\nCart {tk(d.get('total'))} · call them to help finish the order")
    notify('checkout_abandoned', f"abandoned-{d.get('_id')}", text, admin_link('/abandoned'), 'Open list')


def review(r: dict):
    text = f"⭐ <b>New review ({r.get('rating')}★) · {e(r.get('product_name'))}</b>\n{e(r.get('customer_name'))}: {e((r.get('title') or '') + ' ' + (r.get('body') or ''))[:300]}" + (f"\n📷 {len(r['photos'])} photo(s)" if r.get('photos') else '')
    notify('review', f"review-{r.get('_id')}", text, admin_link('/reviews'), 'Approve / reject')


def question(q: dict):
    text = f"❓ <b>Question · {e(q.get('product_name'))}</b>\n{e(q.get('question'))[:300]}"
    notify('question', f"question-{q.get('_id')}", text, admin_link('/reviews'), 'Answer')


# ---------- admin: Settings → Telegram alerts ----------
ROLES = ('super_admin', 'admin')
_bot_cache: dict = {}


def bot_info() -> dict:
    if not token(): return {}
    if _bot_cache.get('t') == token() and time.time() - _bot_cache.get('at', 0) < 600: return _bot_cache['info']
    try: me = _call('getMe'); info = {'username': me.get('username'), 'name': me.get('first_name')}
    except Exception as x: info = {'error': str(x)}
    _bot_cache.update({'t': token(), 'at': time.time(), 'info': info}); return info


@router.get('/api/v1/admin/telegram')
def tg_get(authorization: str | None = Header(None)):
    require_role(authorization, ROLES)
    recent = list(db.tg_outbox.find({}, {'_id': 0, 'text': 0, 'chats': 0, 'done': 0}).sort('created_at', -1).limit(15))
    from .helpers import serialize
    return {**config(), 'token_set': bool(token()), 'bot': bot_info(), 'event_labels': {k: v[0] for k, v in EVENTS.items()}, 'recent': serialize(recent)}


@router.put('/api/v1/admin/telegram')
def tg_put(payload: dict, authorization: str | None = Header(None)):
    actor = require_role(authorization, ROLES)
    chats = []
    for c in (payload.get('chats') or [])[:10]:
        cid = str(c.get('id') if isinstance(c, dict) else c).strip()
        if re.fullmatch(r'-?\d{3,20}', cid): chats.append({'id': cid, 'title': str((c.get('title') if isinstance(c, dict) else '') or cid)[:80]})
    ev = {k: bool((payload.get('events') or {}).get(k, d)) for k, (_, d) in EVENTS.items()}
    try: ls = max(0, min(1000, int(payload.get('low_stock', 3))))
    except (TypeError, ValueError): ls = 3
    db.settings.update_one({'key': 'telegram'}, {'$set': {'chats': chats, 'events': ev, 'low_stock': ls, 'enabled': payload.get('enabled', True) is not False, 'updated_at': now(), 'updated_by': actor['sub']}}, upsert=True)
    start_worker()
    return config()


@router.post('/api/v1/admin/telegram/find-chats')
def tg_find(authorization: str | None = Header(None)):
    """Chats that recently wrote to the bot (send /start to it, or add it to a group and write a message)."""
    require_role(authorization, ROLES)
    try: ups = _call('getUpdates', limit=100, allowed_updates=['message', 'my_chat_member', 'channel_post'])
    except Exception as x: raise HTTPException(400, str(x))
    found = {}
    for u in ups or []:
        m = u.get('message') or u.get('channel_post') or (u.get('my_chat_member') or {})
        ch = m.get('chat') or {}
        if ch.get('id') is None: continue
        title = ch.get('title') or ' '.join(x for x in [ch.get('first_name'), ch.get('last_name')] if x) or ch.get('username') or str(ch['id'])
        found[str(ch['id'])] = {'id': str(ch['id']), 'title': title, 'type': ch.get('type')}
    return list(found.values())


@router.post('/api/v1/admin/telegram/test')
def tg_test(payload: dict | None = None, authorization: str | None = Header(None)):
    require_role(authorization, ROLES)
    chats = [str(x) for x in ((payload or {}).get('chats') or [c['id'] for c in config()['chats']])][:10]
    if not chats: raise HTTPException(400, 'Add a chat first')
    out = []
    for cid in chats:
        try:
            _call('sendMessage', chat_id=cid, parse_mode='HTML', text='✅ <b>EMXIN alerts are working.</b>\nNew orders, payments and other alerts will come to this chat.')
            out.append({'id': cid, 'ok': True})
        except Exception as x: out.append({'id': cid, 'ok': False, 'error': str(x)})
    return out
