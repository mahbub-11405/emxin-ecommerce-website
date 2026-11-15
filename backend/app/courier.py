"""Courier (Steadfast) tracking: create consignments, receive Steadfast webhooks, poll status, rider SMS.

Steadfast API (portal.packzy.com/api/v1, headers Api-Key + Secret-Key):
  POST /create_order            → {status:200, consignment:{consignment_id, tracking_code, status, ...}}
  GET  /status_by_cid/{id}      → {status:200, delivery_status:'in_review'|'pending'|'hold'|'delivered'|...}
Webhook (set the callback URL + Bearer token in the Steadfast portal):
  {notification_type:'delivery_status'|'tracking_update', consignment_id, invoice, status, cod_amount,
   delivery_charge, tracking_message, updated_at}
"""
import re
import logging
import httpx
from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException, Request, Query

from .config import get_settings
from .db import db
from .helpers import now, serialize
from .admin_ext import allow, release_stock

settings = get_settings()
router = APIRouter()
log = logging.getLogger('emxin.courier')

# Steadfast status → (label, tone, finished?)
SF_STATUS = {
    'in_review': ('In review', 'gray', False),
    'pending': ('Picked up · on the way', 'blue', False),
    'hold': ('On hold', 'amber', False),
    'delivered_approval_pending': ('Delivered · awaiting approval', 'green', False),
    'partial_delivered_approval_pending': ('Partly delivered · awaiting approval', 'amber', False),
    'cancelled_approval_pending': ('Cancel requested', 'red', False),
    'unknown_approval_pending': ('Unknown · awaiting approval', 'amber', False),
    'delivered': ('Delivered', 'green', True),
    'partial_delivered': ('Partly delivered', 'amber', True),
    'cancelled': ('Cancelled by courier', 'red', True),
    'unknown': ('Unknown', 'gray', False),
}
ACTIVE = [k for k, v in SF_STATUS.items() if not v[2]]
COURIER_NAMES = {'steadfast': 'Steadfast', 'pathao': 'Pathao'}


def sf_base():
    return (settings.steadfast_base_url or 'https://portal.packzy.com/api/v1').rstrip('/')


def sf_headers():
    return {'Api-Key': settings.steadfast_api_key, 'Secret-Key': settings.steadfast_secret_key, 'Content-Type': 'application/json'}


def norm_status(s) -> str:
    return re.sub(r'[^a-z_]', '', str(s or '').strip().lower().replace(' ', '_')) or 'unknown'


def status_info(s):
    lab, tone, fin = SF_STATUS.get(s, (str(s or 'unknown').replace('_', ' ').title(), 'gray', False))
    return {'key': s, 'label': lab, 'tone': tone, 'finished': fin}


PHONE_RX = re.compile(r'(?:\+?88)?0?1[3-9]\d{8}')


def phones_in(text: str) -> list:
    out = []
    for m in PHONE_RX.findall(text or ''):
        d = re.sub(r'\D', '', m)[-10:]
        p = '0' + d
        if p not in out:
            out.append(p)
    return out


def tracking_url(o) -> str:
    code = o.get('courier_tracking_code')
    if not code:
        return ''
    if o.get('courier') == 'steadfast':
        return f'https://steadfast.com.bd/t/{code}'
    return ''


# ------------------------------------------------------------ create
async def steadfast_create(o: dict) -> dict:
    """Creates the Steadfast consignment and stores its IDs on the order. Raises on failure."""
    from .integrations import IntegrationNotConfigured
    if not settings.steadfast_enabled:
        raise IntegrationNotConfigured('Steadfast is disabled')
    if not (settings.steadfast_api_key and settings.steadfast_secret_key):
        raise IntegrationNotConfigured('Steadfast API key / secret key is missing')
    path = settings.steadfast_create_order_path or '/create_order'
    payload = {'invoice': o['order_id'], 'recipient_name': o['customer_name'], 'recipient_phone': '0' + re.sub(r'\D', '', o['phone'])[-10:],
               'recipient_address': f"{o.get('address', '')}, {o.get('district', '')}".strip(', '),
               'cod_amount': int(round(float((o.get('pricing') or {}).get('cod_due') or 0))), 'note': o.get('courier_note', '')}
    async with httpx.AsyncClient(timeout=25) as c:
        r = await c.post(sf_base() + '/' + path.lstrip('/'), headers=sf_headers(), json=payload)
    r.raise_for_status()
    data = r.json()
    cons = (data or {}).get('consignment') or {}
    if str(data.get('status')) != '200' or not cons.get('consignment_id'):
        raise RuntimeError(f"Steadfast: {data.get('message') or data.get('errors') or data}")
    st = norm_status(cons.get('status') or 'in_review')
    db.orders.update_one({'_id': o['_id']}, {
        '$set': {'order_status': 'Sent to Courier', 'courier': 'steadfast', 'courier_data': data, 'courier_created_at': now(),
                 'courier_consignment_id': str(cons.get('consignment_id')), 'courier_tracking_code': cons.get('tracking_code'),
                 'courier_status': st, 'courier_updated_at': now(), 'updated_at': now()},
        '$push': {'timeline': {'at': now(), 'order_status': 'Sent to Courier',
                               'note': f"Steadfast consignment {cons.get('consignment_id')} · tracking {cons.get('tracking_code')}"},
                  'courier_events': {'at': now(), 'status': st, 'message': 'Consignment created at Steadfast', 'source': 'emxin'}}})
    db.ledger.insert_one({'order_id': o['order_id'], 'type': 'courier_created', 'amount': 0, 'payment_method': o.get('payment_method'), 'courier': 'steadfast',
                          'cod_amount': payload['cod_amount'], 'courier_billing_mode': o.get('courier_billing_mode'), 'created_at': now()})
    return data


# ------------------------------------------------------------ status changes
def mark_delivered(o: dict, partial=False):
    """Same bookkeeping as Admin → Delivered: sold counts, dealer totals, COD collected."""
    if o.get('delivered_counted'):
        return {}
    upd = {'order_status': 'Delivered', 'delivered_counted': True, 'delivered_at': now()}
    for i in o.get('items', []):
        if ObjectId.is_valid(i.get('product_id', '')):
            db.products.update_one({'_id': ObjectId(i['product_id'])}, {'$inc': {'sold_count': i['quantity'], 'reserved': -i['quantity']}})
    if o.get('dealer_id') and ObjectId.is_valid(o['dealer_id']):
        db.dealers.update_one({'_id': ObjectId(o['dealer_id'])}, {'$inc': {'total_orders': 1, 'total_purchase': (o.get('pricing') or {}).get('grand_total', 0)}})
    cod = float((o.get('pricing') or {}).get('cod_due') or 0)
    if cod > 0 and not partial and o.get('payment_status') not in ('Paid', 'COD Collected'):
        upd['payment_status'] = 'COD Collected'
        db.ledger.insert_one({'order_id': o['order_id'], 'type': 'payment_received', 'amount': cod, 'payment_method': 'cod',
                              'source': 'courier_delivered', 'courier': o.get('courier'), 'created_at': now()})
    return upd


def record_event(o: dict, status: str | None, message: str = '', source: str = 'steadfast', extra: dict | None = None) -> bool:
    """Adds a courier event (status change and/or tracking message). Returns True when something new was stored."""
    status = norm_status(status) if status else (o.get('courier_status') or 'unknown')
    last = (o.get('courier_events') or [{}])[-1]
    if last.get('status') == status and (last.get('message') or '') == (message or ''):
        return False
    ev = {'at': now(), 'status': status, 'message': (message or '')[:500], 'source': source, **(extra or {})}
    upd = {'courier_status': status, 'courier_updated_at': now(), 'updated_at': now()}
    phones = phones_in(message)
    if phones:
        upd['courier_rider_phone'] = phones[0]
    tl = None
    if status != o.get('courier_status'):
        info = status_info(status)
        tl = {'at': now(), 'note': f"{COURIER_NAMES.get(o.get('courier'), 'Courier')}: {info['label']}" + (f' · {message}' if message else ''), 'role': 'courier'}
        if status in ('delivered', 'partial_delivered'):
            upd.update(mark_delivered(o, partial=status == 'partial_delivered'))
            tl['order_status'] = 'Delivered'
            if upd.get('payment_status'):
                tl['payment_status'] = upd['payment_status']
        if status == 'cancelled':
            upd['courier_cancelled_at'] = now()  # parcel comes back: Admin marks it Returned when it arrives (stock is released then)
    push = {'courier_events': ev}
    if tl:
        push['timeline'] = tl
    db.orders.update_one({'_id': o['_id']}, {'$set': upd, '$push': push})
    return True


async def steadfast_status(cid: str) -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f'{sf_base()}/status_by_cid/{cid}', headers=sf_headers())
    r.raise_for_status()
    return norm_status(r.json().get('delivery_status'))


async def refresh_one(o: dict) -> dict:
    if o.get('courier') != 'steadfast' or not o.get('courier_consignment_id'):
        return {'changed': False, 'reason': 'not a Steadfast consignment'}
    if not (settings.steadfast_enabled and settings.steadfast_api_key):
        return {'changed': False, 'reason': 'Steadfast API is not set up'}
    st = await steadfast_status(o['courier_consignment_id'])
    changed = st != o.get('courier_status') and record_event(o, st, '', 'status_check')
    db.orders.update_one({'_id': o['_id']}, {'$set': {'courier_checked_at': now()}})
    return {'changed': bool(changed), 'status': st}


async def sync_active(limit: int = 60) -> dict:
    checked = changed = errors = 0
    for o in db.orders.find({'courier': 'steadfast', 'courier_consignment_id': {'$exists': True}, 'courier_status': {'$in': ACTIVE}}).sort('courier_checked_at', 1).limit(limit):
        try:
            r = await refresh_one(o)
            checked += 1
            changed += 1 if r.get('changed') else 0
        except Exception as e:
            errors += 1
            log.warning('courier sync %s failed: %s', o.get('order_id'), e)
    db.settings.update_one({'key': 'courier_sync'}, {'$set': {'key': 'courier_sync', 'at': now(), 'checked': checked, 'changed': changed, 'errors': errors}}, upsert=True)
    return {'checked': checked, 'changed': changed, 'errors': errors}


# ------------------------------------------------------------ webhook
@router.post('/api/v1/webhooks/steadfast')
async def steadfast_webhook(request: Request, authorization: str | None = Header(None)):
    secret = settings.steadfast_webhook_secret
    if not secret or (authorization or '').replace('Bearer', '').strip() != secret:
        raise HTTPException(401, 'Invalid token')
    try:
        p = await request.json()
    except Exception:
        raise HTTPException(400, 'Invalid JSON')
    cid, inv = str(p.get('consignment_id') or ''), str(p.get('invoice') or '')
    o = db.orders.find_one({'$or': [{'courier_consignment_id': cid}] + ([{'order_id': inv}] if inv else [])}) if (cid or inv) else None
    db.courier_webhooks.insert_one({'courier': 'steadfast', 'payload': p, 'order_id': (o or {}).get('order_id'), 'received_at': now()})
    if not o:
        return {'status': 'success', 'message': 'Webhook received (order not found).'}
    status = p.get('status') if p.get('notification_type') == 'delivery_status' else None
    extra = {k: p[k] for k in ('cod_amount', 'delivery_charge') if p.get(k) is not None}
    record_event(o, status, p.get('tracking_message') or '', 'steadfast_webhook', extra)
    if p.get('delivery_charge') is not None:
        db.orders.update_one({'_id': o['_id']}, {'$set': {'courier_delivery_charge': p.get('delivery_charge')}})
    return {'status': 'success', 'message': 'Webhook received successfully.'}


# ------------------------------------------------------------ admin
def shipment_row(o):
    p = o.get('pricing') or {}
    return {'order_id': o['order_id'], 'customer_name': o.get('customer_name'), 'phone': o.get('phone'), 'district': o.get('district'),
            'courier': o.get('courier'), 'courier_name': COURIER_NAMES.get(o.get('courier'), (o.get('courier') or '').title()),
            'consignment_id': o.get('courier_consignment_id'), 'tracking_code': o.get('courier_tracking_code'), 'tracking_url': tracking_url(o),
            'status': status_info(o.get('courier_status') or 'in_review'), 'order_status': o.get('order_status'),
            'cod_due': p.get('cod_due', 0), 'grand_total': p.get('grand_total', 0), 'payment_method': o.get('payment_method'),
            'payment_channel': o.get('payment_channel'), 'manual_payment': {'channel': (o.get('manual_payment') or {}).get('channel')},
            'items': sum(i.get('quantity', 0) for i in o.get('items', [])), 'first_item': (o.get('items') or [{}])[0].get('name'),
            'rider_phone': o.get('courier_rider_phone'), 'sent_at': o.get('courier_created_at'), 'updated_at': o.get('courier_updated_at'),
            'last_message': next((e.get('message') for e in reversed(o.get('courier_events') or []) if e.get('message')), '')}


@router.get('/api/v1/admin/courier/overview')
async def courier_overview(status: str = '', q: str = '', authorization: str | None = Header(None)):
    allow(authorization, 'orders')
    base = {'courier': {'$nin': [None, '']}}
    counts = {}
    for r in db.orders.aggregate([{'$match': base}, {'$group': {'_id': '$courier_status', 'n': {'$sum': 1}}}]):
        counts[r['_id'] or 'in_review'] = r['n']
    query = dict(base)
    if status == 'active':
        query['courier_status'] = {'$in': ACTIVE + [None]}
    elif status:
        query['courier_status'] = status
    if q.strip():
        rx = {'$regex': re.escape(q.strip()), '$options': 'i'}
        query['$or'] = [{'order_id': rx}, {'courier_consignment_id': rx}, {'courier_tracking_code': rx}, {'customer_name': rx}, {'phone': rx}]
    rows = [shipment_row(o) for o in db.orders.find(query).sort('courier_updated_at', -1).limit(200)]
    feed = []
    for o in db.orders.find({**base, 'courier_events.0': {'$exists': True}}, {'order_id': 1, 'customer_name': 1, 'courier': 1, 'courier_events': {'$slice': -5}}).sort('courier_updated_at', -1).limit(30):
        for e in o.get('courier_events', []):
            feed.append({'order_id': o['order_id'], 'customer_name': o.get('customer_name'), 'courier': COURIER_NAMES.get(o.get('courier'), o.get('courier')),
                         'at': e.get('at'), 'status': status_info(e.get('status')), 'message': e.get('message'), 'source': e.get('source')})
    feed.sort(key=lambda x: x['at'] or now(), reverse=True)
    ready = db.orders.count_documents({'order_status': {'$in': ['Confirmed', 'Approved']}, 'courier': {'$in': [None, '']}})
    sync = db.settings.find_one({'key': 'courier_sync'}, {'_id': 0}) or {}
    return serialize({'counts': counts, 'statuses': [{**status_info(k), 'count': counts.get(k, 0)} for k in SF_STATUS],
                      'rows': rows, 'feed': feed[:40], 'ready_to_send': ready, 'last_sync': sync,
                      'setup': {'steadfast_enabled': bool(settings.steadfast_enabled and settings.steadfast_api_key),
                                'webhook_url': settings.backend_public_url.rstrip('/') + '/api/v1/webhooks/steadfast',
                                'webhook_token_set': bool(settings.steadfast_webhook_secret)}})


@router.get('/api/v1/admin/courier/orders/{order_id}')
def courier_detail(order_id: str, authorization: str | None = Header(None)):
    allow(authorization, 'orders')
    o = db.orders.find_one({'order_id': order_id})
    if not o:
        raise HTTPException(404, 'Order not found')
    events = [{**e, 'status_info': status_info(e.get('status'))} for e in (o.get('courier_events') or [])]
    phones = []
    for e in events:
        for p in phones_in(e.get('message', '')):
            if p not in phones:
                phones.append(p)
    rider_sms = list(db.sms_outbox.find({'order_id': order_id, 'kind': 'courier'}).sort('created_at', -1).limit(20))
    return serialize({**shipment_row(o), 'address': o.get('address'), 'items_list': o.get('items', []), 'events': list(reversed(events)),
                      'rider_phones': phones, 'rider_sms': rider_sms, 'courier_notes': list(reversed(o.get('courier_notes') or [])),
                      'delivery_charge': o.get('courier_delivery_charge'), 'pricing': o.get('pricing'), 'timeline': list(reversed(o.get('timeline') or []))})


@router.post('/api/v1/admin/courier/orders/{order_id}/refresh')
async def courier_refresh(order_id: str, authorization: str | None = Header(None)):
    allow(authorization, 'orders_write')
    o = db.orders.find_one({'order_id': order_id})
    if not o:
        raise HTTPException(404, 'Order not found')
    try:
        return await refresh_one(o)
    except httpx.HTTPError as e:
        raise HTTPException(502, f'Steadfast did not answer: {str(e)[:120]}')


@router.post('/api/v1/admin/courier/sync')
async def courier_sync(authorization: str | None = Header(None)):
    allow(authorization, 'orders_write')
    if not (settings.steadfast_enabled and settings.steadfast_api_key):
        raise HTTPException(503, 'Steadfast API is not set up in the backend .env')
    return await sync_active()


@router.post('/api/v1/admin/courier/orders/{order_id}/rider-message')
def rider_message(order_id: str, payload: dict, authorization: str | None = Header(None)):
    """SMS to the delivery man (via BulkSMSBD), or just a note of a phone call. Steadfast has no rider-message API."""
    actor = allow(authorization, 'orders_write')
    o = db.orders.find_one({'order_id': order_id})
    if not o:
        raise HTTPException(404, 'Order not found')
    text = ' '.join(str(payload.get('message', '')).split())[:300]
    if not text:
        raise HTTPException(400, 'Write a message')
    phone = str(payload.get('phone') or '').strip()
    note = {'at': now(), 'by': actor.get('sub'), 'text': text, 'phone': phone, 'sms': bool(payload.get('sms'))}
    if payload.get('sms'):
        digits = re.sub(r'\D', '', phone)[-10:]
        if not re.fullmatch(r'1[3-9]\d{8}', digits):
            raise HTTPException(400, 'Enter the rider mobile number (01XXXXXXXXX)')
        from .notify import queue_sms
        body = f"EMXIN order {o['order_id']}: {text}"
        queue_sms(f"rider-{o['order_id']}-{int(now().timestamp())}", '+880' + digits, body, 'courier', order_id=o['order_id'])
        note['phone'] = '0' + digits
        db.orders.update_one({'_id': o['_id']}, {'$set': {'courier_rider_phone': '0' + digits}})
    db.orders.update_one({'_id': o['_id']}, {'$push': {'courier_notes': note}})
    return {'ok': True}


def start_courier_sync():
    """Background check every 30 minutes (the webhook is instant; this catches anything it missed)."""
    import threading, asyncio, time
    if not (settings.steadfast_enabled and settings.steadfast_api_key):
        return
    def loop():
        time.sleep(60)
        while True:
            try:
                asyncio.run(sync_active())
            except Exception:
                log.exception('courier sync loop')
            time.sleep(1800)
    threading.Thread(target=loop, name='courier-sync', daemon=True).start()
