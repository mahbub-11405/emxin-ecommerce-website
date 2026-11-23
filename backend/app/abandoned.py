"""Abandoned checkouts: someone typed a valid mobile number at checkout but did not place the order.

The checkout page saves a small draft (name, mobile, district, products) a moment after a valid number is typed.
If no order comes from that number within 30 minutes the draft becomes "abandoned": it shows in Admin → Customers →
Abandoned checkouts (call / WhatsApp / mark contacted) and a Telegram alert is sent. An order from the same number
marks it "converted". The address is not saved here (only what is needed to call back).
"""
import logging, re, threading, time
from collections import defaultdict, deque
from datetime import timedelta
from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from .db import db
from .helpers import now, serialize
from .security import require_role, decode_token

log = logging.getLogger('emxin.abandoned')
router = APIRouter()
WAIT_MINUTES = 30          # no order this long after the last change = abandoned
OPEN = ['open', 'abandoned', 'contacted']
ROLES = ('super_admin', 'admin', 'sales', 'support', 'marketing')


class DraftItem(BaseModel):
    product_id: str = Field(max_length=40); quantity: int = Field(ge=1, le=1000); frame_color: str = Field(default='', max_length=40)
class CheckoutDraft(BaseModel):
    phone: str = Field(max_length=20); name: str = Field(default='', max_length=80); district: str = Field(default='', max_length=40)
    items: list[DraftItem] = Field(default_factory=list, max_length=30); session_id: str = Field(default='', max_length=80)


_hits: dict = defaultdict(deque)
def _limited(ip: str, per_hour: int = 60) -> bool:
    q = _hits[ip]; t = time.time()
    while q and t - q[0] > 3600: q.popleft()
    if len(q) >= per_hour: return True
    q.append(t); return False


@router.post('/api/v1/checkout/draft')
def save_draft(body: CheckoutDraft, request: Request, authorization: str | None = Header(None)):
    from .main import normalize_bd_phone, client_ip
    if _limited(client_ip(request) or 'x'): return {'ok': False}
    try: phone = normalize_bd_phone(body.phone)
    except HTTPException: return {'ok': False}
    if not re.fullmatch(r'\+8801[3-9]\d{8}', phone): return {'ok': False}
    # just ordered (the page can send one last draft while the order is being placed): nothing to follow up
    if db.orders.find_one({'phone': phone, 'created_at': {'$gte': now() - timedelta(minutes=WAIT_MINUTES)}}, {'_id': 1}): return {'ok': True, 'ordered': True}
    ids = [ObjectId(i.product_id) for i in body.items if ObjectId.is_valid(i.product_id)]
    pm = {str(p['_id']): p for p in db.products.find({'_id': {'$in': ids}}, {'name': 1, 'price': 1, 'sale_price': 1, 'slug': 1})} if ids else {}
    items = [{'product_id': i.product_id, 'name': pm[i.product_id]['name'], 'slug': pm[i.product_id].get('slug'), 'quantity': i.quantity, 'frame_color': i.frame_color,
              'unit_price': float(pm[i.product_id].get('sale_price') or pm[i.product_id].get('price') or 0)} for i in body.items if i.product_id in pm]
    if not items: return {'ok': False}
    customer_id = None
    if authorization and authorization.startswith('Bearer '):
        try:
            t = decode_token(authorization.split(' ', 1)[1]); customer_id = t['sub'] if t.get('role') == 'customer' else None
        except Exception: pass
    total = round(sum(i['unit_price'] * i['quantity'] for i in items))
    upd = {'phone': phone, 'name': body.name.strip()[:80], 'district': body.district[:40], 'items': items, 'total': total,
           'session_id': body.session_id[:80], 'customer_id': customer_id, 'updated_at': now()}
    d = db.checkout_drafts.find_one({'phone': phone, 'status': {'$in': OPEN}, 'created_at': {'$gte': now() - timedelta(days=3)}}, sort=[('created_at', -1)])
    if d:
        # back again after it was reported: it counts as a fresh visit (a new alert later if they leave again)
        extra = {'status': 'open', 'alerted': False} if d.get('status') == 'abandoned' else {}
        db.checkout_drafts.update_one({'_id': d['_id']}, {'$set': {**upd, **extra}, '$inc': {'visits': 1 if extra else 0}})
    else:
        db.checkout_drafts.insert_one({**upd, 'status': 'open', 'alerted': False, 'visits': 1, 'created_at': now()})
    return {'ok': True}


def mark_converted(phone: str, order_id: str):
    """Called when an order is placed: the number's open draft is done."""
    try: db.checkout_drafts.update_many({'phone': phone, 'status': {'$in': OPEN}}, {'$set': {'status': 'converted', 'order_id': order_id, 'converted_at': now()}})
    except Exception: log.exception('mark converted')


def sweep():
    """Open drafts with no order for WAIT_MINUTES become abandoned (one alert each)."""
    from . import telegram as tg
    limit = now() - timedelta(minutes=WAIT_MINUTES)
    for _ in range(50):
        d = db.checkout_drafts.find_one_and_update({'status': 'open', 'updated_at': {'$lt': limit}},
                                                   {'$set': {'status': 'abandoned', 'abandoned_at': now()}}, return_document=ReturnDocument.AFTER)
        if not d: break
        # ordered in the meantime under another draft / page? then it is converted, not abandoned
        o = db.orders.find_one({'phone': d['phone'], 'created_at': {'$gte': d['created_at'] - timedelta(minutes=WAIT_MINUTES)}}, {'order_id': 1})
        if o:
            db.checkout_drafts.update_one({'_id': d['_id']}, {'$set': {'status': 'converted', 'order_id': o['order_id'], 'converted_at': now()}}); continue
        if not d.get('alerted'):
            tg.checkout_abandoned(d); db.checkout_drafts.update_one({'_id': d['_id']}, {'$set': {'alerted': True}})


_started = False
def _loop():
    while True:
        try: sweep()
        except Exception: log.exception('abandoned sweep')
        time.sleep(60)
def start_worker():
    global _started
    if _started: return
    _started = True; threading.Thread(target=_loop, name='abandoned-checkouts', daemon=True).start()


# ---------- admin ----------
@router.get('/api/v1/admin/abandoned')
def list_drafts(status: str = 'active', authorization: str | None = Header(None)):
    require_role(authorization, ROLES)
    f = {'status': {'$in': ['abandoned', 'contacted']}} if status == 'active' else {'status': status} if status in ('open', 'abandoned', 'contacted', 'converted', 'lost') else {}
    rows = list(db.checkout_drafts.find(f).sort('updated_at', -1).limit(300))
    week = now() - timedelta(days=7)
    stats = {k: db.checkout_drafts.count_documents({'status': k, 'created_at': {'$gte': week}}) for k in ('open', 'abandoned', 'contacted', 'converted', 'lost')}
    return {'rows': serialize(rows), 'week': stats, 'wait_minutes': WAIT_MINUTES}


@router.put('/api/v1/admin/abandoned/{draft_id}')
def update_draft(draft_id: str, payload: dict, authorization: str | None = Header(None)):
    actor = require_role(authorization, ROLES)
    if not ObjectId.is_valid(draft_id): raise HTTPException(400, 'Invalid id')
    st = payload.get('status')
    if st not in ('abandoned', 'contacted', 'lost'): raise HTTPException(400, 'Invalid status')
    note = str(payload.get('note') or '').strip()[:300]
    r = db.checkout_drafts.update_one({'_id': ObjectId(draft_id), 'status': {'$ne': 'converted'}},
                                      {'$set': {'status': st, 'note': note, 'handled_by': actor['sub'], 'handled_at': now()}})
    if not r.matched_count: raise HTTPException(404, 'Not found or already ordered')
    return {'ok': True}
