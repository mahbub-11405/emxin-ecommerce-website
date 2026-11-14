"""EMXIN v2 admin + storefront extensions.

Everything the admin panel needs to *see and control* the store lives here:
range-based dashboard analytics, full order lifecycle, catalog CRUD (products,
categories, brands), coupons, reviews / Q&A moderation, quantity requests,
dealer status, reports, marketing SMS campaigns, global search, notifications
and audit logs.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import re

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from .db import db
from .helpers import now, serialize, slugify, next_product_codes
from .security import require_role, decode_token
from .schemas import (CategoryInput, BrandInput, CouponInput, OrderStatusUpdate,
                      ReviewInput, QuestionInput)

router = APIRouter()
DHAKA = ZoneInfo('Asia/Dhaka')

STAFF_ROLES = ('super_admin', 'admin', 'sales', 'marketing', 'inventory', 'support')
# Who may use each admin area. super_admin can do everything; staff management is super_admin only.
AREA_ROLES = {
    'dashboard': STAFF_ROLES,
    'orders': ('super_admin', 'admin', 'sales', 'support', 'inventory'),
    'orders_write': ('super_admin', 'admin', 'sales', 'support'),
    'catalog': ('super_admin', 'admin', 'inventory'),
    'customers': ('super_admin', 'admin', 'sales', 'support', 'marketing'),
    'dealers': ('super_admin', 'admin', 'sales'),
    'marketing': ('super_admin', 'admin', 'marketing'),
    'coupons': ('super_admin', 'admin', 'marketing'),
    'reviews': ('super_admin', 'admin', 'support', 'marketing'),
    'reports': ('super_admin', 'admin', 'sales', 'marketing'),
    'audit': ('super_admin',),
}
PAID_STATUSES = ('Paid', 'COD Collected')
SUCCESS_STATUSES = ('Confirmed', 'Processing', 'Sent to Courier', 'Delivered', 'Completed')
RELEASED_STATUSES = ('Cancelled', 'Returned')
PAYMENT_LABELS = {
    'cod': 'Cash on Delivery (COD)', 'bkash': 'bKash', 'nagad': 'Nagad', 'rocket': 'Rocket',
    'card': 'Card', 'bank': 'Bank Transfer', 'paystation': 'Digital (PayStation)', 'other': 'Other',
}


def allow(authorization, area):
    return require_role(authorization, AREA_ROLES[area])


def to_oid(value, label='id'):
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(400, f'Invalid {label}')


def audit(actor, action, target='', meta=None):
    db.audit_logs.insert_one({'actor_id': actor.get('sub'), 'actor_role': actor.get('role'), 'action': action,
                              'target_id': target, 'metadata': meta or {}, 'created_at': now()})


# ---------------------------------------------------------------- periods
def local_midnight(dt):
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def period_bounds(range_key: str, start: str | None = None, end: str | None = None):
    """Return (start_utc, end_utc, bucket) for a dashboard range in Dhaka time."""
    today = local_midnight(datetime.now(DHAKA))
    if range_key == 'yesterday':
        s, e = today - timedelta(days=1), today
    elif range_key == '7d':
        s, e = today - timedelta(days=6), today + timedelta(days=1)
    elif range_key == '30d':
        s, e = today - timedelta(days=29), today + timedelta(days=1)
    elif range_key == 'custom':
        try:
            s = datetime.strptime(start, '%Y-%m-%d').replace(tzinfo=DHAKA)
            e = datetime.strptime(end, '%Y-%m-%d').replace(tzinfo=DHAKA) + timedelta(days=1)
        except Exception:
            raise HTTPException(400, 'Custom range needs start and end as YYYY-MM-DD')
        if e <= s or (e - s).days > 366:
            raise HTTPException(400, 'Custom range must be 1-366 days')
    else:
        s, e = today, today + timedelta(days=1)
    bucket = 'hour' if (e - s) <= timedelta(days=1) else 'day'
    return s.astimezone(timezone.utc), e.astimezone(timezone.utc), bucket


def bucket_keys(s, e, bucket):
    keys = []
    cur = s.astimezone(DHAKA)
    end = e.astimezone(DHAKA)
    step = timedelta(hours=2) if bucket == 'hour' else timedelta(days=1)
    while cur < end:
        keys.append(cur)
        cur += step
    return keys


def bucket_label(dt, bucket):
    if bucket == 'hour':
        h = dt.hour % 12 or 12
        return f"{h} {'AM' if dt.hour < 12 else 'PM'}"
    return dt.strftime('%d %b')


def bucket_index(created, s, bucket):
    local = created.replace(tzinfo=timezone.utc) if created.tzinfo is None else created
    delta = local - s
    return int(delta.total_seconds() // (7200 if bucket == 'hour' else 86400))


def visitors_by_bucket(s, e, bucket, n):
    """Unique sessions per bucket (a session is counted once per bucket)."""
    counts = [0] * n
    seen = set()
    total = set()
    cursor = db.analytics_events.find({'event_type': 'page_view', 'created_at': {'$gte': s, '$lt': e}},
                                      {'session_id': 1, 'created_at': 1, '_id': 0})
    for ev in cursor:
        i = bucket_index(ev['created_at'], s, bucket)
        if 0 <= i < n and (i, ev['session_id']) not in seen:
            seen.add((i, ev['session_id']))
            counts[i] += 1
        total.add(ev['session_id'])
    return counts, len(total)


def order_amount_paid(o):
    p = o.get('pricing') or {}
    if o.get('payment_status') in PAID_STATUSES:
        return float(p.get('grand_total') or 0)
    if o.get('payment_status') == 'Advance Paid':
        return float(p.get('advance_required') or 0)
    return 0.0


def payment_key(o):
    ch = o.get('payment_channel')
    if ch:
        return ch
    return o.get('payment_method') or 'other'


def period_stats(s, e, bucket=None):
    n = len(bucket_keys(s, e, bucket)) if bucket else 0
    vis_series, visitors = visitors_by_bucket(s, e, bucket, n) if bucket else ([], 0)
    if not bucket:
        visitors = len(db.analytics_events.distinct('session_id', {'event_type': 'page_view', 'created_at': {'$gte': s, '$lt': e}}))
    orders = list(db.orders.find({'created_at': {'$gte': s, '$lt': e}},
                                 {'order_status': 1, 'payment_status': 1, 'payment_method': 1, 'payment_channel': 1,
                                  'pricing': 1, 'created_at': 1}))
    pur_series = [0] * n
    sales_series = [0.0] * n
    order_series = [0] * n
    purchases = paid = cod = 0
    sales = 0.0
    methods = {}
    for o in orders:
        ok = o.get('order_status') in SUCCESS_STATUSES or o.get('payment_status') in PAID_STATUSES
        amt = order_amount_paid(o)
        if ok:
            purchases += 1
        if o.get('payment_status') in PAID_STATUSES or o.get('payment_status') == 'Advance Paid':
            paid += 1
        if o.get('payment_method') == 'cod':
            cod += 1
        sales += amt
        k = payment_key(o)
        if o.get('order_status') not in RELEASED_STATUSES:
            methods[k] = methods.get(k, 0) + 1
        if bucket:
            i = bucket_index(o['created_at'], s, bucket)
            if 0 <= i < n:
                order_series[i] += 1
                sales_series[i] += amt
                if ok:
                    pur_series[i] += 1
    return {
        'visitors': visitors, 'orders': len(orders), 'purchases': purchases, 'paid_orders': paid,
        'cod_orders': cod, 'sales': round(sales, 2),
        'conversion': round(purchases / visitors * 100, 2) if visitors else 0.0,
        'methods': methods,
        'series': {'visitors': vis_series, 'purchases': pur_series, 'sales': [round(x, 2) for x in sales_series],
                   'orders': order_series},
    }


def pct_change(cur, prev):
    if not prev:
        return None
    return round((cur - prev) / prev * 100, 1)


# ---------------------------------------------------------------- dashboard
@router.get('/api/v1/admin/me')
def admin_me(authorization: str | None = Header(None)):
    ident = allow(authorization, 'dashboard')
    try:
        oid = ObjectId(ident['sub'])
    except Exception:
        oid = None
    doc = (db.admins.find_one({'_id': oid}, {'password_hash': 0}) or db.staff.find_one({'_id': oid}, {'password_hash': 0})) if oid else None
    return {'id': ident['sub'], 'role': ident['role'], 'name': (doc or {}).get('name') or ('Super Admin' if ident['role'] == 'super_admin' else 'Staff'),
            'email': (doc or {}).get('email', ''), 'must_change_password': bool((doc or {}).get('must_change_password'))}


@router.get('/api/v1/admin/dashboard/v2')
def dashboard_v2(range: str = 'today', start: str | None = None, end: str | None = None,
                 authorization: str | None = Header(None)):
    allow(authorization, 'dashboard')
    s, e, bucket = period_bounds(range, start, end)
    cur = period_stats(s, e, bucket)
    length = e - s
    prev = period_stats(s - length, s)
    keys = bucket_keys(s, e, bucket)
    funnel = {k: db.analytics_events.count_documents({'event_type': k, 'created_at': {'$gte': s, '$lt': e}})
              for k in ('product_view', 'add_to_cart', 'checkout_started')}
    total_methods = sum(cur['methods'].values()) or 1
    methods = [{'key': k, 'label': PAYMENT_LABELS.get(k, k.title()), 'count': v,
                'percent': round(v / total_methods * 100, 1)}
               for k, v in sorted(cur['methods'].items(), key=lambda kv: -kv[1])]
    summary = []
    for label, key in (('Today', 'today'), ('Yesterday', 'yesterday'), ('Last 7 Days', '7d'), ('Last 30 Days', '30d')):
        ps, pe, _ = period_bounds(key)
        st = period_stats(ps, pe)
        summary.append({'period': label, 'visitors': st['visitors'], 'purchases': st['purchases'],
                        'conversion': st['conversion'], 'sales': st['sales']})
    recent = list(db.orders.find({'created_at': {'$gte': s, '$lt': e}}).sort('created_at', -1).limit(8))
    if not recent:
        recent = list(db.orders.find().sort('created_at', -1).limit(8))
    low_stock = list(db.products.find({'status': 'active', '$expr': {'$lte': ['$stock', {'$ifNull': ['$low_stock_threshold', 5]}]}},
                                      {'name': 1, 'stock': 1, 'slug': 1}).sort('stock', 1).limit(6))
    return {
        'range': range, 'bucket': bucket, 'last_updated': now().isoformat(),
        'cards': {
            'visitors': {'value': cur['visitors'], 'change': pct_change(cur['visitors'], prev['visitors']), 'spark': cur['series']['visitors']},
            'purchases': {'value': cur['purchases'], 'change': pct_change(cur['purchases'], prev['purchases']), 'spark': cur['series']['purchases']},
            'sales': {'value': cur['sales'], 'change': pct_change(cur['sales'], prev['sales']), 'spark': cur['series']['sales']},
            'orders': {'value': cur['orders'], 'paid': cur['paid_orders'], 'cod': cur['cod_orders'], 'change': pct_change(cur['orders'], prev['orders']), 'spark': cur['series']['orders']},
        },
        'chart': {'labels': [bucket_label(k, bucket) for k in keys], 'visitors': cur['series']['visitors'], 'purchases': cur['series']['purchases']},
        'glance': {'visitors': cur['visitors'], 'product_views': funnel['product_view'], 'add_to_cart': funnel['add_to_cart'],
                   'checkout_started': funnel['checkout_started'], 'orders_placed': cur['orders'], 'successful_purchases': cur['purchases']},
        'payment_methods': {'total': sum(cur['methods'].values()), 'items': methods},
        'summary': summary,
        'recent_orders': serialize(recent),
        'low_stock': serialize(low_stock),
        'counts': nav_counts(),
    }


def nav_counts():
    return {
        'orders_pending': db.orders.count_documents({'order_status': 'Pending Confirmation'}),
        'quantity_requests_new': db.quantity_requests.count_documents({'status': 'New'}),
        'dealers_pending': db.dealers.count_documents({'status': 'Pending'}),
        'reviews_pending': db.reviews.count_documents({'status': 'pending'}),
        'questions_pending': db.questions.count_documents({'status': 'pending'}),
    }


@router.get('/api/v1/admin/counts')
def admin_counts(authorization: str | None = Header(None)):
    allow(authorization, 'dashboard')
    return nav_counts()


@router.get('/api/v1/admin/notifications')
def notifications(authorization: str | None = Header(None)):
    allow(authorization, 'dashboard')
    items = []
    for o in db.orders.find({'order_status': 'Pending Confirmation'}).sort('created_at', -1).limit(8):
        items.append({'type': 'order', 'title': f"New order {o['order_id']}", 'text': f"{o.get('customer_name', '')} · ৳{(o.get('pricing') or {}).get('grand_total', 0)}", 'href': f"/orders?open={o['order_id']}", 'created_at': o['created_at']})
    for q in db.quantity_requests.find({'status': 'New'}).sort('created_at', -1).limit(5):
        items.append({'type': 'quantity', 'title': f"{q.get('urgency', 'Normal')} quantity request", 'text': f"{q.get('shop_name', '')} · {q.get('product_name', '')}", 'href': '/quantity-requests', 'created_at': q['created_at']})
    for d in db.dealers.find({'status': 'Pending'}).sort('created_at', -1).limit(5):
        items.append({'type': 'dealer', 'title': 'Dealer application', 'text': d.get('shop_name', ''), 'href': '/dealers', 'created_at': d['created_at']})
    for r in db.reviews.find({'status': 'pending'}).sort('created_at', -1).limit(5):
        items.append({'type': 'review', 'title': 'Review awaiting approval', 'text': f"{r.get('rating')}★ {r.get('product_name', '')}", 'href': '/reviews', 'created_at': r['created_at']})
    items.sort(key=lambda x: x['created_at'], reverse=True)
    return serialize(items[:15])


@router.get('/api/v1/admin/search')
def global_search(q: str = Query(..., min_length=2), authorization: str | None = Header(None)):
    allow(authorization, 'dashboard')
    rx = {'$regex': re.escape(q.strip()), '$options': 'i'}
    orders = list(db.orders.find({'$or': [{'order_id': rx}, {'customer_name': rx}, {'phone': rx}]},
                                 {'order_id': 1, 'customer_name': 1, 'order_status': 1, 'pricing.grand_total': 1}).limit(6))
    customers = list(db.customers.find({'$or': [{'name': rx}, {'phone': rx}, {'email': rx}]},
                                       {'name': 1, 'phone': 1, 'email': 1}).limit(6))
    products = list(db.products.find({'$or': [{'name': rx}, {'sku': rx}, {'model': rx}]},
                                     {'name': 1, 'slug': 1, 'stock': 1}).limit(6))
    dealers = list(db.dealers.find({'$or': [{'shop_name': rx}, {'name': rx}, {'phone': rx}]},
                                   {'shop_name': 1, 'phone': 1, 'status': 1}).limit(4))
    return {'orders': serialize(orders), 'customers': serialize(customers), 'products': serialize(products), 'dealers': serialize(dealers)}


# ---------------------------------------------------------------- orders
@router.get('/api/v1/admin/orders/search')
def orders_search(status: str | None = None, payment: str | None = None, method: str | None = None,
                  q: str | None = None, start: str | None = None, end: str | None = None,
                  page: int = 1, page_size: int = 25, authorization: str | None = Header(None)):
    allow(authorization, 'orders')
    f = {}
    if status:
        f['order_status'] = status
    if payment == 'to_verify':  # bKash/Nagad Send Money waiting for Admin to check the TrxID
        f['manual_payment.status'] = 'pending'
    elif payment:
        f['payment_status'] = payment
    if method:
        f['$or'] = [{'payment_method': method}, {'payment_channel': method}]
    if q:
        rx = {'$regex': re.escape(q.strip()), '$options': 'i'}
        f.setdefault('$and', []).append({'$or': [{'order_id': rx}, {'customer_name': rx}, {'phone': rx}, {'shop_name': rx}]})
    if start or end:
        s, e, _ = period_bounds('custom', start or end, end or start)
        f['created_at'] = {'$gte': s, '$lt': e}
    page_size = max(5, min(page_size, 100))
    page = max(1, page)
    total = db.orders.count_documents(f)
    rows = list(db.orders.find(f).sort('created_at', -1).skip((page - 1) * page_size).limit(page_size))
    by_status = {x['_id']: x['n'] for x in db.orders.aggregate([{'$group': {'_id': '$order_status', 'n': {'$sum': 1}}}])}
    return {'total': total, 'page': page, 'page_size': page_size, 'rows': serialize(rows), 'by_status': by_status}


@router.get('/api/v1/admin/orders/{order_id}/detail')
def order_detail(order_id: str, authorization: str | None = Header(None)):
    allow(authorization, 'orders')
    o = db.orders.find_one({'order_id': order_id})
    if not o:
        raise HTTPException(404, 'Order not found')
    customer = db.customers.find_one({'_id': ObjectId(o['customer_id'])}, {'password_hash': 0}) if o.get('customer_id') and ObjectId.is_valid(o['customer_id']) else None
    previous = db.orders.count_documents({'phone': o.get('phone'), 'order_id': {'$ne': order_id}})
    ledger = list(db.ledger.find({'order_id': order_id}).sort('created_at', -1))
    callbacks = list(db.payment_callbacks.find({'order_id': order_id}, {'payload': 0}).sort('received_at', -1).limit(10))
    return {'order': serialize(o), 'customer': serialize(customer), 'previous_orders': previous,
            'ledger': serialize(ledger), 'payment_callbacks': serialize(callbacks)}


def release_stock(o):
    if o.get('stock_released'):
        return
    for i in o.get('items', []):
        if ObjectId.is_valid(i.get('product_id', '')):
            db.products.update_one({'_id': ObjectId(i['product_id'])}, {'$inc': {'stock': i['quantity'], 'reserved': -i['quantity']}})
    db.orders.update_one({'_id': o['_id']}, {'$set': {'stock_released': True}})


@router.put('/api/v1/admin/orders/{order_id}/status')
def update_order_status(order_id: str, body: OrderStatusUpdate, authorization: str | None = Header(None)):
    actor = allow(authorization, 'orders_write')
    o = db.orders.find_one({'order_id': order_id})
    if not o:
        raise HTTPException(404, 'Order not found')
    updates = {'updated_at': now()}
    event = {'at': now(), 'by': actor['sub'], 'role': actor['role'], 'note': body.note.strip()[:500]}
    if body.order_status and body.order_status != o.get('order_status'):
        if o.get('order_status') in RELEASED_STATUSES:
            raise HTTPException(409, 'Cancelled/returned orders cannot be reopened; create a new order instead')
        if body.order_status in ('Confirmed', 'Processing', 'Sent to Courier') and o.get('payment_method') == 'manual' \
                and (o.get('manual_payment') or {}).get('status') != 'verified':
            raise HTTPException(409, 'Verify the bKash/Nagad payment first')
        updates['order_status'] = body.order_status
        event['order_status'] = body.order_status
        if body.order_status in RELEASED_STATUSES:
            release_stock(o)
        if body.order_status in ('Delivered', 'Completed') and not o.get('delivered_counted'):
            updates['delivered_counted'] = True
            updates['delivered_at'] = now()
            for i in o.get('items', []):
                if ObjectId.is_valid(i.get('product_id', '')):
                    db.products.update_one({'_id': ObjectId(i['product_id'])}, {'$inc': {'sold_count': i['quantity'], 'reserved': -i['quantity']}})
            if o.get('dealer_id') and ObjectId.is_valid(o['dealer_id']):
                db.dealers.update_one({'_id': ObjectId(o['dealer_id'])}, {'$inc': {'total_orders': 1, 'total_purchase': (o.get('pricing') or {}).get('grand_total', 0)}})
    if body.payment_status and body.payment_status != o.get('payment_status'):
        updates['payment_status'] = body.payment_status
        event['payment_status'] = body.payment_status
        if body.payment_status in PAID_STATUSES + ('Advance Paid',):
            amt = order_amount_paid({**o, 'payment_status': body.payment_status})
            db.ledger.insert_one({'order_id': order_id, 'type': 'payment_received', 'amount': amt,
                                  'payment_method': body.payment_channel or o.get('payment_method'),
                                  'verified_by': actor['sub'], 'note': body.note[:300], 'created_at': now()})
        if body.payment_status == 'Refunded':
            db.ledger.insert_one({'order_id': order_id, 'type': 'refund', 'amount': -order_amount_paid(o),
                                  'payment_method': o.get('payment_method'), 'verified_by': actor['sub'], 'note': body.note[:300], 'created_at': now()})
    if body.payment_channel:
        updates['payment_channel'] = body.payment_channel
    db.orders.update_one({'_id': o['_id']}, {'$set': updates, '$push': {'timeline': event}})
    if updates.get('order_status') == 'Confirmed':  # same event key as the Confirm button, so the customer gets it once
        from .notify import queue_sms, t_order_confirmed
        queue_sms('order-confirmed-' + order_id, o['phone'], t_order_confirmed(db.orders.find_one({'_id': o['_id']})), 'order', order_id=order_id)
    audit(actor, 'order_updated', order_id, {k: v for k, v in event.items() if k not in ('at',)})
    return serialize(db.orders.find_one({'_id': o['_id']}))


@router.post('/api/v1/admin/orders/{order_id}/note')
def order_note(order_id: str, payload: dict, authorization: str | None = Header(None)):
    actor = allow(authorization, 'orders_write')
    text = str(payload.get('note', '')).strip()[:1000]
    if not text:
        raise HTTPException(400, 'Note is required')
    r = db.orders.update_one({'order_id': order_id}, {'$push': {'timeline': {'at': now(), 'by': actor['sub'], 'role': actor['role'], 'note': text}}})
    if not r.matched_count:
        raise HTTPException(404, 'Order not found')
    return {'ok': True}


# ---------------------------------------------------------------- products
@router.get('/api/v1/admin/products/{product_id}')
def admin_product(product_id: str, authorization: str | None = Header(None)):
    allow(authorization, 'catalog')
    p = db.products.find_one({'_id': to_oid(product_id, 'product id')})
    if not p:
        raise HTTPException(404, 'Product not found')
    return serialize(p)


@router.delete('/api/v1/admin/products/{product_id}')
def delete_product(product_id: str, authorization: str | None = Header(None)):
    actor = allow(authorization, 'catalog')
    oid = to_oid(product_id, 'product id')
    p = db.products.find_one({'_id': oid})
    if not p:
        raise HTTPException(404, 'Product not found')
    if db.orders.find_one({'items.product_id': product_id}):
        db.products.update_one({'_id': oid}, {'$set': {'status': 'hidden', 'updated_at': now()}})
        audit(actor, 'product_hidden', product_id, {'reason': 'has_orders'})
        return {'ok': True, 'hidden': True, 'message': 'Product has orders, so it was hidden instead of deleted.'}
    db.products.delete_one({'_id': oid})
    audit(actor, 'product_deleted', product_id, {'name': p.get('name')})
    return {'ok': True, 'deleted': True}


@router.put('/api/v1/admin/products/{product_id}/stock')
def adjust_stock(product_id: str, payload: dict, authorization: str | None = Header(None)):
    actor = allow(authorization, 'catalog')
    oid = to_oid(product_id, 'product id')
    delta = payload.get('delta')
    if not isinstance(delta, int) or delta == 0 or abs(delta) > 100000:
        raise HTTPException(400, 'delta must be a non-zero integer')
    p = db.products.find_one({'_id': oid})
    if not p:
        raise HTTPException(404, 'Product not found')
    if p.get('stock', 0) + delta < 0:
        raise HTTPException(409, 'Stock cannot go below zero')
    db.products.update_one({'_id': oid}, {'$inc': {'stock': delta}, '$set': {'updated_at': now()}})
    db.inventory_log.insert_one({'product_id': product_id, 'delta': delta, 'reason': str(payload.get('reason', ''))[:200],
                                 'by': actor['sub'], 'created_at': now()})
    return {'ok': True, 'stock': p.get('stock', 0) + delta}


@router.post('/api/v1/admin/products/{product_id}/duplicate')
def duplicate_product(product_id: str, authorization: str | None = Header(None)):
    allow(authorization, 'catalog')
    p = db.products.find_one({'_id': to_oid(product_id, 'product id')})
    if not p:
        raise HTTPException(404, 'Product not found')
    p.pop('_id')
    base = p['slug'] + '-copy'
    slug = base
    n = 2
    while db.products.find_one({'slug': slug}):
        slug = f'{base}-{n}'
        n += 1
    codes = next_product_codes(db, p.get('category_slug', ''), p.get('brand_slug', ''), p.get('model', ''))  # copy gets its own SKU (…-2) and next stock code
    p.update({'sku': codes['sku'], 'compare_note': codes['compare_note'] or p.get('compare_note', '')})
    p.update({'slug': slug, 'name': p['name'] + ' (Copy)', 'status': 'draft', 'reserved': 0, 'sold_count': 0,
              'rating': 0, 'review_count': 0, 'created_at': now(), 'updated_at': now()})
    r = db.products.insert_one(p)
    return {'id': str(r.inserted_id), 'slug': slug}


# ---------------------------------------------------------------- categories / brands
@router.put('/api/v1/admin/categories/{slug}')
def update_category(slug: str, body: CategoryInput, authorization: str | None = Header(None)):
    actor = allow(authorization, 'catalog')
    d = body.model_dump()
    d['slug'] = d.get('slug') or slugify(d['name'])
    if d['slug'] != slug and db.categories.find_one({'slug': d['slug']}):
        raise HTTPException(409, 'Another category already uses that slug')
    r = db.categories.update_one({'slug': slug}, {'$set': {**d, 'updated_at': now()}})
    if not r.matched_count:
        raise HTTPException(404, 'Category not found')
    if d['slug'] != slug:
        db.products.update_many({'category_slug': slug}, {'$set': {'category_slug': d['slug']}})
    audit(actor, 'category_updated', d['slug'])
    return {'ok': True}


@router.delete('/api/v1/admin/categories/{slug}')
def delete_category(slug: str, authorization: str | None = Header(None)):
    actor = allow(authorization, 'catalog')
    used = db.products.count_documents({'category_slug': slug})
    if used:
        raise HTTPException(409, f'{used} product(s) use this category. Move them first or hide the category.')
    db.categories.delete_one({'slug': slug})
    audit(actor, 'category_deleted', slug)
    return {'ok': True}


@router.get('/api/v1/admin/brands')
def admin_brands(authorization: str | None = Header(None)):
    allow(authorization, 'catalog')
    rows = list(db.brands.find().sort('order', 1))
    counts = {x['_id']: x['n'] for x in db.products.aggregate([{'$group': {'_id': '$brand_slug', 'n': {'$sum': 1}}}])}
    for b in rows:
        b['product_count'] = counts.get(b['slug'], 0)
    return serialize(rows)


@router.put('/api/v1/admin/brands/{slug}')
def update_brand(slug: str, body: BrandInput, authorization: str | None = Header(None)):
    actor = allow(authorization, 'catalog')
    d = body.model_dump()
    d['slug'] = d.get('slug') or slugify(d['name'])
    if d['slug'] != slug and db.brands.find_one({'slug': d['slug']}):
        raise HTTPException(409, 'Another brand already uses that slug')
    r = db.brands.update_one({'slug': slug}, {'$set': {**d, 'updated_at': now()}})
    if not r.matched_count:
        raise HTTPException(404, 'Brand not found')
    if d['slug'] != slug:
        db.products.update_many({'brand_slug': slug}, {'$set': {'brand_slug': d['slug']}})
    audit(actor, 'brand_updated', d['slug'])
    return {'ok': True}


@router.delete('/api/v1/admin/brands/{slug}')
def delete_brand(slug: str, authorization: str | None = Header(None)):
    actor = allow(authorization, 'catalog')
    used = db.products.count_documents({'brand_slug': slug})
    if used:
        raise HTTPException(409, f'{used} product(s) use this brand. Move them first or hide the brand.')
    db.brands.delete_one({'slug': slug})
    audit(actor, 'brand_deleted', slug)
    return {'ok': True}


# ---------------------------------------------------------------- coupons
def parse_dt(v):
    if not v:
        return None
    try:
        return datetime.strptime(v[:10], '%Y-%m-%d').replace(tzinfo=DHAKA).astimezone(timezone.utc)
    except Exception:
        raise HTTPException(400, 'Dates must be YYYY-MM-DD')


def coupon_doc(body: CouponInput):
    d = body.model_dump()
    d['code'] = re.sub(r'[^A-Z0-9_-]', '', d['code'].upper())
    if len(d['code']) < 3:
        raise HTTPException(400, 'Coupon code must have at least 3 letters/numbers')
    if d['type'] == 'percentage' and d['value'] > 100:
        raise HTTPException(400, 'Percentage cannot exceed 100')
    d['starts_at'] = parse_dt(d['starts_at'])
    d['ends_at'] = parse_dt(d['ends_at'])
    if d['ends_at']:
        d['ends_at'] = d['ends_at'] + timedelta(days=1)
    return d


@router.get('/api/v1/admin/coupons')
def list_coupons(authorization: str | None = Header(None)):
    allow(authorization, 'coupons')
    rows = list(db.coupons.find().sort('created_at', -1))
    uses = {x['_id']: x for x in db.orders.aggregate([
        {'$match': {'coupon_code': {'$ne': None}, 'order_status': {'$nin': list(RELEASED_STATUSES)}}},
        {'$group': {'_id': '$coupon_code', 'n': {'$sum': 1}, 'discount': {'$sum': '$pricing.coupon_discount'}}}])}
    for c in rows:
        u = uses.get(c['code'], {})
        c['used'] = u.get('n', 0)
        c['total_discount'] = round(u.get('discount', 0), 2)
    return serialize(rows)


@router.post('/api/v1/admin/coupons')
def create_coupon(body: CouponInput, authorization: str | None = Header(None)):
    actor = allow(authorization, 'coupons')
    d = coupon_doc(body)
    d.update({'created_at': now(), 'updated_at': now(), 'created_by': actor['sub']})
    try:
        db.coupons.insert_one(d)
    except DuplicateKeyError:
        raise HTTPException(409, 'Coupon code already exists')
    audit(actor, 'coupon_created', d['code'])
    return {'ok': True, 'code': d['code']}


@router.put('/api/v1/admin/coupons/{code}')
def update_coupon(code: str, body: CouponInput, authorization: str | None = Header(None)):
    actor = allow(authorization, 'coupons')
    d = coupon_doc(body)
    if d['code'] != code.upper() and db.coupons.find_one({'code': d['code']}):
        raise HTTPException(409, 'Coupon code already exists')
    r = db.coupons.update_one({'code': code.upper()}, {'$set': {**d, 'updated_at': now()}})
    if not r.matched_count:
        raise HTTPException(404, 'Coupon not found')
    audit(actor, 'coupon_updated', d['code'])
    return {'ok': True}


@router.delete('/api/v1/admin/coupons/{code}')
def delete_coupon(code: str, authorization: str | None = Header(None)):
    actor = allow(authorization, 'coupons')
    db.coupons.delete_one({'code': code.upper()})
    audit(actor, 'coupon_deleted', code.upper())
    return {'ok': True}


@router.get('/api/v1/coupons/validate')
def validate_coupon(code: str, subtotal: float = 0):
    c = db.coupons.find_one({'code': code.strip().upper(), 'active': True})
    n = now()
    if not c or (c.get('starts_at') and n < c['starts_at'].replace(tzinfo=timezone.utc)) or (c.get('ends_at') and n > c['ends_at'].replace(tzinfo=timezone.utc)):
        raise HTTPException(404, 'Coupon is invalid or expired')
    if c.get('usage_limit') and db.orders.count_documents({'coupon_code': c['code'], 'order_status': {'$nin': list(RELEASED_STATUSES)}}) >= c['usage_limit']:
        raise HTTPException(409, 'Coupon usage limit reached')
    if subtotal and subtotal < float(c.get('min_order') or 0):
        raise HTTPException(400, f"Minimum order ৳{c.get('min_order')} required for this coupon")
    return {'code': c['code'], 'type': c['type'], 'value': c['value'], 'max_discount': c.get('max_discount'),
            'min_order': c.get('min_order', 0), 'description': c.get('description', ''), 'allow_bulk': bool(c.get('allow_bulk'))}


def coupon_public(c, subtotal: float = 0):
    v = float(c['value']); cap = c.get('max_discount')
    label = (f"{v:g}% OFF" + (f" up to ৳{float(cap):,.0f}" if cap else '')) if c['type'] == 'percentage' else f"৳{v:,.0f} OFF"
    mo = float(c.get('min_order') or 0)
    return {'code': c['code'], 'label': label, 'description': c.get('description', ''), 'min_order': mo,
            # ends_at is stored as the start of the day AFTER the last valid day
            'ends_at': c['ends_at'].replace(tzinfo=timezone.utc).isoformat() if c.get('ends_at') else None,
            'allow_bulk': bool(c.get('allow_bulk')), 'popup': c.get('promote_popup', True) is not False,
            'eligible': not subtotal or subtotal >= mo, 'short_by': max(0, mo - subtotal) if subtotal else 0}


def live_coupons(extra: dict):
    n = now()
    for c in db.coupons.find({'active': True, 'show_public': {'$ne': False}, **extra}).sort([('value', -1), ('created_at', -1)]).limit(30):
        if c.get('starts_at') and n < c['starts_at'].replace(tzinfo=timezone.utc): continue
        if c.get('ends_at') and n > c['ends_at'].replace(tzinfo=timezone.utc): continue
        if c.get('usage_limit') and db.orders.count_documents({'coupon_code': c['code'], 'order_status': {'$nin': list(RELEASED_STATUSES)}}) >= c['usage_limit']: continue
        yield c


@router.get('/api/v1/coupons/available')
def available_coupons(subtotal: float = 0):
    """Coupons shown at checkout: active, in date, not used up, not secret. `eligible` says if this cart qualifies."""
    out = [coupon_public(c, subtotal) for c in live_coupons({})][:20]
    out.sort(key=lambda x: (not x['eligible'], x['min_order']))
    return out


@router.get('/api/v1/coupons/featured')
def featured_coupon():
    """The one coupon promoted on the website (offer bar, popup, product pages). Biggest discount wins if several are promoted."""
    c = next(live_coupons({'promote': True}), None)
    return coupon_public(c) if c else {}


# ---------------------------------------------------------------- reviews & questions
def optional_customer(authorization):
    if not authorization or not authorization.startswith('Bearer '):
        return None
    try:
        t = decode_token(authorization.split(' ', 1)[1])
        return t if t.get('role') == 'customer' else None
    except Exception:
        return None


def recompute_rating(product_id: str):
    agg = list(db.reviews.aggregate([{'$match': {'product_id': product_id, 'status': 'approved'}},
                                     {'$group': {'_id': None, 'avg': {'$avg': '$rating'}, 'n': {'$sum': 1}}}]))
    avg, n = (round(agg[0]['avg'], 1), agg[0]['n']) if agg else (0, 0)
    if ObjectId.is_valid(product_id):
        db.products.update_one({'_id': ObjectId(product_id)}, {'$set': {'rating': avg, 'review_count': n}})


@router.get('/api/v1/products/{product_id}/reviews')
def public_reviews(product_id: str):
    rows = list(db.reviews.find({'product_id': product_id, 'status': 'approved'},
                                {'customer_id': 0, 'phone': 0}).sort('created_at', -1).limit(50))
    dist = {str(i): 0 for i in range(1, 6)}
    for r in db.reviews.find({'product_id': product_id, 'status': 'approved'}, {'rating': 1}):
        dist[str(r['rating'])] += 1
    return {'reviews': serialize(rows), 'distribution': dist}


@router.post('/api/v1/reviews')
def submit_review(body: ReviewInput, authorization: str | None = Header(None)):
    ident = require_role(authorization, ('customer',))
    p = db.products.find_one({'_id': to_oid(body.product_id, 'product id')})
    if not p:
        raise HTTPException(404, 'Product not found')
    c = db.customers.find_one({'_id': ObjectId(ident['sub'])}) or {}
    if db.reviews.find_one({'product_id': body.product_id, 'customer_id': ident['sub']}):
        raise HTTPException(409, 'You have already reviewed this product')
    verified = bool(db.orders.find_one({'customer_id': ident['sub'], 'items.product_id': body.product_id,
                                        'order_status': {'$in': ['Delivered', 'Completed']}}))
    db.reviews.insert_one({**body.model_dump(), 'product_name': p['name'], 'customer_id': ident['sub'],
                           'customer_name': (c.get('name') or 'Customer').split(' ')[0], 'verified_purchase': verified,
                           'status': 'pending', 'created_at': now()})
    return {'ok': True, 'status': 'pending', 'message': 'Thank you! Your review will appear after moderation.'}


@router.get('/api/v1/products/{product_id}/questions')
def public_questions(product_id: str):
    return serialize(list(db.questions.find({'product_id': product_id, 'status': 'answered'},
                                            {'customer_id': 0}).sort('answered_at', -1).limit(50)))


@router.post('/api/v1/questions')
def ask_question(body: QuestionInput, authorization: str | None = Header(None)):
    ident = optional_customer(authorization)
    p = db.products.find_one({'_id': to_oid(body.product_id, 'product id')})
    if not p:
        raise HTTPException(404, 'Product not found')
    db.questions.insert_one({**body.model_dump(), 'product_name': p['name'], 'customer_id': ident['sub'] if ident else None,
                             'status': 'pending', 'created_at': now()})
    return {'ok': True, 'message': 'Question received. The answer will be published here.'}


@router.get('/api/v1/admin/reviews')
def admin_reviews(status: str | None = None, authorization: str | None = Header(None)):
    allow(authorization, 'reviews')
    f = {'status': status} if status else {}
    return serialize(list(db.reviews.find(f).sort('created_at', -1).limit(300)))


@router.put('/api/v1/admin/reviews/{review_id}')
def moderate_review(review_id: str, payload: dict, authorization: str | None = Header(None)):
    actor = allow(authorization, 'reviews')
    status = payload.get('status')
    if status not in ('approved', 'rejected', 'pending'):
        raise HTTPException(400, 'Invalid status')
    oid = to_oid(review_id, 'review id')
    r = db.reviews.find_one({'_id': oid})
    if not r:
        raise HTTPException(404, 'Review not found')
    upd = {'status': status, 'moderated_by': actor['sub'], 'moderated_at': now()}
    if isinstance(payload.get('reply'), str):
        upd['reply'] = payload['reply'][:1000]
    db.reviews.update_one({'_id': oid}, {'$set': upd})
    recompute_rating(r['product_id'])
    return {'ok': True}


@router.delete('/api/v1/admin/reviews/{review_id}')
def delete_review(review_id: str, authorization: str | None = Header(None)):
    allow(authorization, 'reviews')
    r = db.reviews.find_one_and_delete({'_id': to_oid(review_id, 'review id')})
    if r:
        recompute_rating(r['product_id'])
    return {'ok': True}


@router.get('/api/v1/admin/questions')
def admin_questions(authorization: str | None = Header(None)):
    allow(authorization, 'reviews')
    return serialize(list(db.questions.find().sort('created_at', -1).limit(300)))


@router.put('/api/v1/admin/questions/{question_id}')
def answer_question(question_id: str, payload: dict, authorization: str | None = Header(None)):
    actor = allow(authorization, 'reviews')
    answer = str(payload.get('answer', '')).strip()
    status = payload.get('status') or ('answered' if answer else 'pending')
    if status not in ('answered', 'hidden', 'pending'):
        raise HTTPException(400, 'Invalid status')
    db.questions.update_one({'_id': to_oid(question_id, 'question id')},
                            {'$set': {'answer': answer[:2000], 'status': status, 'answered_by': actor['sub'], 'answered_at': now()}})
    return {'ok': True}


# ---------------------------------------------------------------- quantity requests / dealers
@router.put('/api/v1/admin/quantity-requests/{request_id}')
def update_quantity_request(request_id: str, payload: dict, authorization: str | None = Header(None)):
    actor = allow(authorization, 'customers')
    status = payload.get('status')
    upd = {'updated_at': now()}
    if status:
        if status not in ('New', 'Contacted', 'Quoted', 'Converted', 'Closed'):
            raise HTTPException(400, 'Invalid status')
        upd['status'] = status
    if isinstance(payload.get('assigned_to'), str):
        upd['assigned_to'] = payload['assigned_to'][:120]
    push = {}
    if str(payload.get('note', '')).strip():
        push = {'$push': {'notes': {'at': now(), 'by': actor['sub'], 'text': str(payload['note'])[:1000]}}}
    r = db.quantity_requests.update_one({'_id': to_oid(request_id, 'request id')}, {'$set': upd, **push})
    if not r.matched_count:
        raise HTTPException(404, 'Request not found')
    return {'ok': True}


@router.put('/api/v1/admin/dealers/{dealer_id}/status')
def dealer_status(dealer_id: str, payload: dict, authorization: str | None = Header(None)):
    actor = require_role(authorization, ('super_admin', 'admin'))
    status = payload.get('status')
    if status not in ('Active', 'Pending', 'Rejected', 'Suspended'):
        raise HTTPException(400, 'Invalid status')
    oid = to_oid(dealer_id, 'dealer id')
    d = db.dealers.find_one({'_id': oid})
    if not d:
        raise HTTPException(404, 'Dealer not found')
    upd = {'status': status, 'updated_at': now(), 'status_note': str(payload.get('note', ''))[:500]}
    if status == 'Active':
        upd['discount_approved'] = True
    db.dealers.update_one({'_id': oid}, {'$set': upd})
    from .notify import queue_sms, ensure_dealer_code, t_dealer_approved, t_dealer_rejected
    if status == 'Active':
        code = ensure_dealer_code(d)  # EMX-DLR-70001, 70002, … given once
        if d.get('status') != 'Active':
            queue_sms(f'dealer-approved-{dealer_id}', d['phone'], t_dealer_approved(code), 'dealer')
    elif status == 'Rejected' and d.get('status') != 'Rejected':
        queue_sms(f'dealer-rejected-{dealer_id}', d['phone'], t_dealer_rejected(), 'dealer')
    audit(actor, 'dealer_status', dealer_id, {'status': status})
    return {'ok': True}


@router.get('/api/v1/admin/dealer-leads')
def dealer_leads(authorization: str | None = Header(None)):
    allow(authorization, 'dealers')
    return serialize(list(db.dealer_leads.find().sort('updated_at', -1).limit(300)))


# ---------------------------------------------------------------- reports
@router.get('/api/v1/admin/reports/overview')
def reports_overview(range: str = '30d', start: str | None = None, end: str | None = None,
                     authorization: str | None = Header(None)):
    allow(authorization, 'reports')
    s, e, bucket = period_bounds(range, start, end)
    if bucket == 'hour':
        bucket = 'hour'
    keys = bucket_keys(s, e, bucket)
    stats = period_stats(s, e, bucket)
    orders = list(db.orders.find({'created_at': {'$gte': s, '$lt': e}, 'order_status': {'$nin': list(RELEASED_STATUSES)}},
                                 {'items': 1, 'district': 1, 'pricing': 1, 'payment_status': 1, 'order_status': 1}))
    products, districts = {}, {}
    gross = discounts = delivery = 0.0
    for o in orders:
        p = o.get('pricing') or {}
        gross += float(p.get('grand_total') or 0)
        discounts += float(p.get('bulk_discount') or 0) + float(p.get('coupon_discount') or 0) + float(p.get('payment_discount') or 0)
        delivery += float(p.get('delivery_charge') or 0)
        d = (o.get('district') or 'Unknown').strip().title()
        districts[d] = districts.get(d, 0) + 1
        for i in o.get('items', []):
            row = products.setdefault(i.get('product_id'), {'name': i.get('name'), 'qty': 0, 'revenue': 0.0})
            row['qty'] += int(i.get('quantity') or 0)
            row['revenue'] += float(i.get('unit_price') or 0) * int(i.get('quantity') or 0)
    cancelled = db.orders.count_documents({'created_at': {'$gte': s, '$lt': e}, 'order_status': {'$in': list(RELEASED_STATUSES)}})
    status_split = {x['_id']: x['n'] for x in db.orders.aggregate([
        {'$match': {'created_at': {'$gte': s, '$lt': e}}}, {'$group': {'_id': '$order_status', 'n': {'$sum': 1}}}])}
    top = sorted(products.values(), key=lambda x: -x['revenue'])[:10]
    new_customers = db.customers.count_documents({'created_at': {'$gte': s, '$lt': e}})
    return {
        'labels': [bucket_label(k, bucket) for k in keys], 'series': stats['series'],
        'totals': {'orders': stats['orders'], 'paid_sales': stats['sales'], 'booked_value': round(gross, 2),
                   'discounts': round(discounts, 2), 'delivery_collected': round(delivery, 2), 'visitors': stats['visitors'],
                   'purchases': stats['purchases'], 'conversion': stats['conversion'], 'cancelled_or_returned': cancelled,
                   'new_customers': new_customers, 'avg_order_value': round(gross / len(orders), 2) if orders else 0},
        'top_products': [{**x, 'revenue': round(x['revenue'], 2)} for x in top],
        'districts': sorted([{'district': k, 'orders': v} for k, v in districts.items()], key=lambda x: -x['orders'])[:12],
        'status_split': status_split,
        'payment_methods': [{'label': PAYMENT_LABELS.get(k, k), 'count': v} for k, v in stats['methods'].items()],
        'inventory': serialize(list(db.products.find({}, {'name': 1, 'stock': 1, 'reserved': 1, 'sold_count': 1, 'status': 1, 'price': 1, 'sale_price': 1}).sort('stock', 1))),
    }


# ---------------------------------------------------------------- marketing
SEGMENTS = {
    'all_customers': ('All registered customers', {}),
    'no_order': ('Registered, never ordered', {'total_orders': 0}),
    'hot_leads': ('Hot leads (checkout / quantity interest)', {'lead_priority': 'Hot', 'total_orders': 0}),
    'repeat_buyers': ('Repeat buyers (2+ orders)', {'total_orders': {'$gte': 2}}),
}


@router.get('/api/v1/admin/marketing/segments')
def marketing_segments(authorization: str | None = Header(None)):
    allow(authorization, 'marketing')
    out = [{'key': k, 'label': v[0], 'count': db.customers.count_documents({**v[1], 'phone': {'$exists': True}})} for k, v in SEGMENTS.items()]
    out.append({'key': 'active_dealers', 'label': 'Active dealers', 'count': db.dealers.count_documents({'status': 'Active'})})
    campaigns = list(db.campaigns.find().sort('created_at', -1).limit(20))
    return {'segments': out, 'campaigns': serialize(campaigns)}


@router.post('/api/v1/admin/marketing/campaigns')
def create_campaign(payload: dict, authorization: str | None = Header(None)):
    actor = require_role(authorization, ('super_admin', 'admin', 'marketing'))
    seg = payload.get('segment')
    message = str(payload.get('message', '')).strip()
    if seg not in list(SEGMENTS) + ['active_dealers']:
        raise HTTPException(400, 'Unknown segment')
    if not 5 <= len(message) <= 600:
        raise HTTPException(400, 'Message must be 5-600 characters')
    if 'stop' not in message.lower() and 'বন্ধ' not in message:
        message += ' Reply STOP to opt out.'
    cid = 'cmp-' + now().strftime('%y%m%d%H%M%S')
    phones = [d['phone'] for d in (db.dealers.find({'status': 'Active'}, {'phone': 1}) if seg == 'active_dealers'
                                   else db.customers.find({**SEGMENTS[seg][1], 'phone': {'$exists': True}, 'marketing_opt_out': {'$ne': True}}, {'phone': 1}))]
    for ph in phones:
        key = f'{cid}-{ph}'
        db.sms_outbox.update_one({'event_key': key}, {'$setOnInsert': {'event_key': key, 'phone': ph, 'message': message, 'status': 'pending', 'campaign_id': cid, 'created_at': now()}}, upsert=True)
    db.campaigns.insert_one({'campaign_id': cid, 'segment': seg, 'message': message, 'recipients': len(phones), 'created_by': actor['sub'], 'created_at': now()})
    audit(actor, 'campaign_queued', cid, {'segment': seg, 'recipients': len(phones)})
    return {'ok': True, 'campaign_id': cid, 'queued': len(phones)}


# ---------------------------------------------------------------- audit
@router.get('/api/v1/admin/audit-logs')
def audit_logs(authorization: str | None = Header(None), limit: int = 200):
    allow(authorization, 'audit')
    return serialize(list(db.audit_logs.find().sort('created_at', -1).limit(max(1, min(limit, 1000)))))
