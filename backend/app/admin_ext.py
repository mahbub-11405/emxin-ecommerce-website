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
import time
from concurrent.futures import ThreadPoolExecutor

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pymongo.errors import DuplicateKeyError

from .db import db, data_version, live_version
from .helpers import now, serialize, slugify, next_product_codes
from .pricing import coupon_applies, coupon_base
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
    'card': 'Card', 'bank': 'Bank Transfer', 'paystation': 'Online (PayStation)', 'other': 'Other',
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


def _pv(s, e):
    return {'event_type': 'page_view', 'created_at': {'$gte': s, '$lt': e}}


def unique_visitors(s, e):
    """Unique sessions in a period, counted by MongoDB (no session list sent over the network)."""
    try:
        r = list(db.analytics_events.aggregate([{'$match': _pv(s, e)}, {'$group': {'_id': '$session_id'}}, {'$count': 'n'}]))
        return r[0]['n'] if r else 0
    except Exception:
        return len(db.analytics_events.distinct('session_id', _pv(s, e)))


def visitors_by_bucket(s, e, bucket, n):
    """Unique sessions per bucket (a session is counted once per bucket) + unique sessions in the whole period."""
    step = 7200000 if bucket == 'hour' else 86400000
    counts = [0] * n
    try:
        rows = db.analytics_events.aggregate([
            {'$match': _pv(s, e)},
            {'$group': {'_id': {'b': {'$floor': {'$divide': [{'$subtract': ['$created_at', s]}, step]}}, 's': '$session_id'}}},
            {'$group': {'_id': '$_id.b', 'n': {'$sum': 1}}}])
        for r in rows:
            i = int(r['_id'] or 0)
            if 0 <= i < n:
                counts[i] = r['n']
        return counts, unique_visitors(s, e)
    except Exception:  # very old MongoDB / test double: count in Python
        seen, total = set(), set()
        for ev in db.analytics_events.find(_pv(s, e), {'session_id': 1, 'created_at': 1, '_id': 0}):
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
    """bkash / nagad / cod / bank … — the provider, never a generic "digital"."""
    m = o.get('payment_method')
    if m == 'manual':
        return (o.get('manual_payment') or {}).get('channel') or o.get('payment_channel') or 'bkash'
    if m == 'cod':
        return 'cod'
    return o.get('payment_channel') or m or 'other'


def money_split(orders):
    """Order value by how it is paid. A bulk order's advance counts under bKash/Nagad, the rest under COD."""
    rows = {}
    def add(k, amount, received, n=1):
        r = rows.setdefault(k, {'key': k, 'label': PAYMENT_LABELS.get(k, k.title()), 'amount': 0.0, 'received': 0.0, 'orders': 0})
        r['amount'] += amount; r['received'] += received; r['orders'] += n
    for o in orders:
        if o.get('order_status') in RELEASED_STATUSES:
            continue
        p = o.get('pricing') or {}
        total = float(p.get('grand_total') or 0); cod = float(p.get('cod_due') or 0) if o.get('payment_method') != 'cod' else total
        pre = max(0.0, total - cod)
        st = o.get('payment_status')
        if pre > 0:
            add(payment_key(o) if o.get('payment_method') != 'cod' else 'other', pre, pre if st in PAID_STATUSES + ('Advance Paid',) else 0.0)
        if cod > 0:
            add('cod', cod, cod if st == 'COD Collected' else 0.0, 1 if pre == 0 else 0)
    items = sorted(rows.values(), key=lambda r: -r['amount'])
    total = sum(r['amount'] for r in items)
    for r in items:
        r['amount'] = round(r['amount'], 2); r['received'] = round(r['received'], 2)
        r['percent'] = round(r['amount'] / total * 100, 1) if total else 0
    return {'items': items, 'total': round(total, 2), 'received': round(sum(r['received'] for r in items), 2)}


def customer_type_split(orders):
    """Order value by who bought: retail customers vs dealers (the role stored on each order)."""
    out = {'retail': {'orders': 0, 'amount': 0.0}, 'dealer': {'orders': 0, 'amount': 0.0}}
    for o in orders:
        if o.get('order_status') in RELEASED_STATUSES:
            continue
        t = 'dealer' if (o.get('customer_type') or ('dealer' if o.get('dealer_id') else 'retail')) == 'dealer' else 'retail'
        out[t]['orders'] += 1
        out[t]['amount'] += float((o.get('pricing') or {}).get('grand_total') or 0)
    tot = out['retail']['amount'] + out['dealer']['amount']
    for v in out.values():
        v['amount'] = round(v['amount'], 2)
        v['percent'] = round(v['amount'] / tot * 100, 1) if tot else 0
    return out


def period_stats(s, e, bucket=None):
    n = len(bucket_keys(s, e, bucket)) if bucket else 0
    vis_series, visitors = visitors_by_bucket(s, e, bucket, n) if bucket else ([], 0)
    if not bucket:
        visitors = unique_visitors(s, e)
    orders = list(db.orders.find({'created_at': {'$gte': s, '$lt': e}},
                                 {'order_status': 1, 'payment_status': 1, 'payment_method': 1, 'payment_channel': 1,
                                  'manual_payment.channel': 1, 'pricing': 1, 'created_at': 1, 'customer_type': 1, 'dealer_id': 1}))
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
        'methods': methods, 'money': money_split(orders), 'customer_types': customer_type_split(orders),
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


_POOL = ThreadPoolExecutor(max_workers=16, thread_name_prefix='dash')
_DASH_CACHE: dict = {}


def _funnel(s, e):
    return {k: db.analytics_events.count_documents({'event_type': k, 'created_at': {'$gte': s, '$lt': e}})
            for k in ('product_view', 'add_to_cart', 'checkout_started')}


async def live_events(is_disconnected, tick=0.2, ping_every=15):
    """Server-Sent Events: one message the moment data changes. v = anything on the dashboard, d = business data (badges)."""
    import asyncio, json
    last = None
    quiet = 0.0
    while True:
        cur = (live_version[0], data_version[0])
        if cur != last:
            last = cur
            quiet = 0.0
            yield f"data: {json.dumps({'v': cur[0], 'd': cur[1]})}\n\n"
        elif quiet >= ping_every:  # keep proxies and the browser from closing an idle connection
            quiet = 0.0
            yield ': ping\n\n'
        if await is_disconnected():
            return
        await asyncio.sleep(tick)
        quiet += tick


@router.get('/api/v1/admin/live')
async def admin_live(request: Request, authorization: str | None = Header(None)):
    allow(authorization, 'dashboard')
    return StreamingResponse(live_events(request.is_disconnected), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive'})


@router.get('/api/v1/admin/dashboard/v2')
def dashboard_v2(range: str = 'today', start: str | None = None, end: str | None = None, fresh: bool = False,
                 authorization: str | None = Header(None)):
    allow(authorization, 'dashboard')
    key = (range, start, end)
    hit = _DASH_CACHE.get(key)
    ver = live_version[0]  # read before computing: a write during the computation makes this result stale right away
    if hit and not fresh and hit[2] == ver:  # nothing at all changed since: reuse (several admin tabs share one computation)
        return hit[1]
    s, e, bucket = period_bounds(range, start, end)
    length = e - s
    keys = bucket_keys(s, e, bucket)
    # MongoDB is on the network: run the ~15 independent queries at the same time instead of one after another
    jobs = {
        'cur': lambda: period_stats(s, e, bucket),
        'prev': lambda: period_stats(s - length, s),
        'funnel': lambda: _funnel(s, e),
        'recent': lambda: list(db.orders.find({'created_at': {'$gte': s, '$lt': e}}).sort('created_at', -1).limit(8)) or list(db.orders.find().sort('created_at', -1).limit(8)),
        'low_stock': lambda: list(db.products.find({'status': 'active', '$expr': {'$lte': ['$stock', {'$ifNull': ['$low_stock_threshold', 5]}]}},
                                                   {'name': 1, 'stock': 1, 'slug': 1}).sort('stock', 1).limit(6)),
        'courier': lambda: courier_summary(s, e),
        'counts': lambda: nav_counts(parallel=False),
    }
    SUMMARY = (('Today', 'today'), ('Yesterday', 'yesterday'), ('Last 7 Days', '7d'), ('Last 30 Days', '30d'))
    for _, k in SUMMARY:
        if k != range:  # the selected range is already "cur"
            ps, pe, _b = period_bounds(k)
            jobs['sum_' + k] = (lambda ps=ps, pe=pe: period_stats(ps, pe))
    futs = {k: _POOL.submit(f) for k, f in jobs.items()}
    r = {k: f.result() for k, f in futs.items()}
    cur, prev, funnel = r['cur'], r['prev'], r['funnel']
    total_methods = sum(cur['methods'].values()) or 1
    methods = [{'key': k, 'label': PAYMENT_LABELS.get(k, k.title()), 'count': v,
                'percent': round(v / total_methods * 100, 1)}
               for k, v in sorted(cur['methods'].items(), key=lambda kv: -kv[1])]
    summary = []
    for label, k in SUMMARY:
        st = cur if k == range else r['sum_' + k]
        summary.append({'period': label, 'visitors': st['visitors'], 'purchases': st['purchases'],
                        'conversion': st['conversion'], 'sales': st['sales']})
    out = {
        'range': range, 'bucket': bucket, 'last_updated': now().isoformat(), 'version': ver,
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
        'money': cur['money'],
        'customer_types': cur['customer_types'],
        'courier': r['courier'],
        'summary': summary,
        'recent_orders': serialize(r['recent']),
        'low_stock': serialize(r['low_stock']),
        'counts': r['counts'],
    }
    if len(_DASH_CACHE) > 50:
        _DASH_CACHE.clear()
    _DASH_CACHE[key] = (time.monotonic(), out, ver)
    return out


def courier_summary(s, e):
    """Courier side of the dashboard: parcels on the way, delivered / cancelled by the courier in this period."""
    active = ['in_review', 'pending', 'hold', 'delivered_approval_pending', 'partial_delivered_approval_pending', 'cancelled_approval_pending', 'unknown_approval_pending', 'unknown']
    on_way = db.orders.count_documents({'courier': {'$nin': [None, '']}, 'courier_status': {'$in': active}})
    hold = db.orders.count_documents({'courier': {'$nin': [None, '']}, 'courier_status': 'hold'})
    delivered = db.orders.count_documents({'courier_status': {'$in': ['delivered', 'partial_delivered']}, 'courier_updated_at': {'$gte': s, '$lt': e}})
    cancelled = list(db.orders.find({'courier_status': {'$in': ['cancelled', 'cancelled_approval_pending']}, 'order_status': {'$nin': list(RELEASED_STATUSES)}},
                                    {'order_id': 1, 'customer_name': 1, 'courier': 1, 'courier_status': 1, 'courier_updated_at': 1, 'pricing.grand_total': 1,
                                     'courier_events': {'$slice': -1}}).sort('courier_updated_at', -1).limit(8))
    cancelled_period = db.orders.count_documents({'courier_status': 'cancelled', 'courier_cancelled_at': {'$gte': s, '$lt': e}})
    ready = db.orders.count_documents({'order_status': {'$in': ['Confirmed', 'Approved']}, 'courier': {'$in': [None, '']}})
    return {'on_the_way': on_way, 'on_hold': hold, 'delivered': delivered, 'cancelled': cancelled_period, 'ready_to_send': ready,
            'cancelled_list': serialize([{'order_id': o['order_id'], 'customer_name': o.get('customer_name'), 'courier': o.get('courier'),
                                          'status': o.get('courier_status'), 'at': o.get('courier_updated_at'), 'amount': (o.get('pricing') or {}).get('grand_total'),
                                          'message': ((o.get('courier_events') or [{}])[-1]).get('message', '')} for o in cancelled])}


_COUNT_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix='counts')


def nav_counts(parallel=True):
    """Sidebar badges. parallel=True runs the counts at the same time (one network round trip instead of eight)."""
    q = {
        'orders_pending': lambda: db.orders.count_documents({'order_status': 'Pending Confirmation'}),
        'payments_to_verify': lambda: db.orders.count_documents({'manual_payment.status': 'pending', 'order_status': {'$nin': list(RELEASED_STATUSES)}}),
        'courier_attention': lambda: db.orders.count_documents({'courier_status': {'$in': ['cancelled', 'cancelled_approval_pending', 'hold']}, 'order_status': {'$nin': list(RELEASED_STATUSES)}}),
        'quantity_requests_new': lambda: db.quantity_requests.count_documents({'status': 'New'}),
        'dealers_pending': lambda: db.dealers.count_documents({'status': 'Pending'}),
        'reviews_pending': lambda: db.reviews.count_documents({'status': 'pending'}),
        'questions_pending': lambda: db.questions.count_documents({'status': 'pending'}),
    }
    if not parallel:
        return {k: f() for k, f in q.items()}
    futs = {k: _COUNT_POOL.submit(f) for k, f in q.items()}
    return {k: f.result() for k, f in futs.items()}


@router.get('/api/v1/admin/counts')
def admin_counts(authorization: str | None = Header(None)):
    allow(authorization, 'dashboard')
    return nav_counts()


@router.get('/api/v1/admin/notifications')
def notifications(authorization: str | None = Header(None)):
    """Bell menu: what needs a person right now, newest first, with enough detail to act without opening the page."""
    allow(authorization, 'dashboard')
    live = {'$nin': list(RELEASED_STATUSES)}
    P = {'order_id': 1, 'customer_name': 1, 'phone': 1, 'pricing.grand_total': 1, 'payment_method': 1, 'payment_channel': 1, 'payment_status': 1,
         'manual_payment': 1, 'items.quantity': 1, 'items.name': 1, 'created_at': 1, 'courier_status': 1, 'courier_updated_at': 1, 'courier': 1, 'dealer_id': 1}
    q = {
        'verify': lambda: list(db.orders.find({'manual_payment.status': 'pending', 'order_status': live}, P).sort('created_at', -1).limit(10)),
        'orders': lambda: list(db.orders.find({'order_status': 'Pending Confirmation'}, P).sort('created_at', -1).limit(12)),
        'courier': lambda: list(db.orders.find({'courier_status': {'$in': ['cancelled', 'cancelled_approval_pending', 'hold']}, 'order_status': live}, P).sort('courier_updated_at', -1).limit(5)),
        'qty': lambda: list(db.quantity_requests.find({'status': 'New'}).sort('created_at', -1).limit(5)),
        'dealers': lambda: list(db.dealers.find({'status': 'Pending'}, {'shop_name': 1, 'name': 1, 'district': 1, 'created_at': 1, 'applications': 1}).sort('created_at', -1).limit(5)),
        'reviews': lambda: list(db.reviews.find({'status': 'pending'}, {'rating': 1, 'product_name': 1, 'name': 1, 'customer_name': 1, 'created_at': 1}).sort('created_at', -1).limit(5)),
        'counts': lambda: nav_counts(parallel=False),
    }
    futs = {k: _POOL.submit(f) for k, f in q.items()}
    r = {k: f.result() for k, f in futs.items()}

    def money(o):
        return float((o.get('pricing') or {}).get('grand_total') or 0)

    def pcs(o):
        its = o.get('items') or []
        n = sum(int(i.get('quantity') or 0) for i in its)
        first = (its[0].get('name') if its else '') or ''
        return f"{n} pcs · {first[:38]}{'…' if len(first) > 38 else ''}" + (f" +{len(its) - 1} more" if len(its) > 1 else '')

    items, seen = [], set()
    for o in r['verify']:
        mp = o.get('manual_payment') or {}
        ch = mp.get('channel') or o.get('payment_channel') or 'manual'
        seen.add(o['order_id'])
        items.append({'type': 'payment', 'tone': 'amber', 'channel': ch, 'title': f"Verify {mp.get('channel_label') or ch.title()} payment",
                      'order_id': o['order_id'], 'who': o.get('customer_name', ''), 'amount': float(mp.get('amount_expected') or money(o)),
                      'text': f"TrxID {mp.get('trx_id', '—')} · from {mp.get('sender') or '—'}", 'href': f"/orders?open={o['order_id']}",
                      'created_at': mp.get('submitted_at') or o['created_at']})
    for o in r['orders']:
        if o['order_id'] in seen:
            continue
        cod = o.get('payment_method') == 'cod'
        items.append({'type': 'order', 'tone': 'blue', 'channel': 'cod' if cod else (o.get('payment_channel') or o.get('payment_method')),
                      'title': 'New order — call & confirm' if cod else 'New order', 'order_id': o['order_id'], 'who': o.get('customer_name', ''),
                      'amount': money(o), 'text': pcs(o) + (' · Cash on Delivery' if cod else ''), 'href': f"/orders?open={o['order_id']}", 'created_at': o['created_at']})
    for o in r['courier']:
        st = o.get('courier_status') or ''
        items.append({'type': 'courier', 'tone': 'red' if 'cancel' in st else 'amber', 'title': 'Courier: parcel cancelled' if 'cancel' in st else 'Courier: parcel on hold',
                      'order_id': o['order_id'], 'who': o.get('customer_name', ''), 'amount': money(o), 'text': 'Call the customer, then decide: resend or mark Returned',
                      'href': f"/courier?open={o['order_id']}", 'created_at': o.get('courier_updated_at') or o['created_at']})
    for x in r['qty']:
        items.append({'type': 'quantity', 'tone': 'violet', 'title': f"{x.get('urgency', 'Normal')} quantity request", 'who': x.get('shop_name', ''),
                      'text': f"{x.get('product_name', '')} · {x.get('quantity', '')} pcs".strip(' ·'), 'href': '/quantity-requests', 'created_at': x['created_at']})
    for d in r['dealers']:
        again = (d.get('applications') or 1) > 1
        items.append({'type': 'dealer', 'tone': 'green', 'title': 'Dealer re-applied' if again else 'New dealer application', 'who': d.get('shop_name') or d.get('name', ''),
                      'text': d.get('district', ''), 'href': '/dealers', 'created_at': d['created_at']})
    for v in r['reviews']:
        items.append({'type': 'review', 'tone': 'gray', 'title': f"{v.get('rating', '')}★ review to approve", 'who': v.get('name') or v.get('customer_name', ''),
                      'text': v.get('product_name', ''), 'href': '/reviews', 'created_at': v['created_at']})
    items.sort(key=lambda x: x['created_at'], reverse=True)
    c = r['counts']
    summary = [x for x in (
        {'key': 'payments', 'label': 'payments to verify', 'count': c.get('payments_to_verify', 0), 'href': '/orders?status=Pending Confirmation', 'tone': 'amber'},
        {'key': 'orders', 'label': 'orders to confirm', 'count': c.get('orders_pending', 0), 'href': '/orders?status=Pending Confirmation', 'tone': 'blue'},
        {'key': 'courier', 'label': 'courier issues', 'count': c.get('courier_attention', 0), 'href': '/courier', 'tone': 'red'},
        {'key': 'dealers', 'label': 'dealer applications', 'count': c.get('dealers_pending', 0), 'href': '/dealers', 'tone': 'green'},
        {'key': 'reviews', 'label': 'reviews & questions', 'count': c.get('reviews_pending', 0) + c.get('questions_pending', 0), 'href': '/reviews', 'tone': 'gray'},
    ) if x['count']]
    return serialize({'items': items[:25], 'summary': summary})


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
        if body.order_status == 'Cancelled':  # the customer sees who cancelled and why (the note); the SMS has no reason
            updates.update({'cancelled_by': 'emxin', 'cancel_reason': body.note.strip()[:300], 'cancelled_at': now()})
        if body.order_status in ('Delivered', 'Completed') and not o.get('delivered_counted') and \
                db.orders.find_one_and_update({'_id': o['_id'], 'delivered_counted': {'$ne': True}},
                                              {'$set': {'delivered_counted': True, 'delivered_at': now()}}, {'_id': 1}):
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
    if updates.get('order_status') == 'Cancelled':
        from .notify import queue_sms, t_order_cancelled
        queue_sms('order-cancelled-' + order_id, o['phone'], t_order_cancelled(o), 'order', order_id=order_id)
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
def delete_product(product_id: str, confirm: str = '', authorization: str | None = Header(None)):
    actor = allow(authorization, 'catalog')
    from .recycle import move_to_bin, check_confirm
    check_confirm(confirm)
    oid = to_oid(product_id, 'product id')
    p = db.products.find_one({'_id': oid})
    if not p:
        raise HTTPException(404, 'Product not found')
    if db.orders.find_one({'items.product_id': product_id}):
        db.products.update_one({'_id': oid}, {'$set': {'status': 'hidden', 'updated_at': now()}})
        audit(actor, 'product_hidden', product_id, {'reason': 'has_orders'})
        return {'ok': True, 'hidden': True, 'message': 'Product has orders, so it was hidden instead of deleted.'}
    move_to_bin('product', 'products', p, actor, p.get('name', ''), p.get('sku') or p.get('slug', ''))
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
def delete_category(slug: str, confirm: str = '', authorization: str | None = Header(None)):
    actor = allow(authorization, 'catalog')
    from .recycle import move_to_bin, check_confirm
    check_confirm(confirm)
    used = db.products.count_documents({'category_slug': slug})
    if used:
        raise HTTPException(409, f'{used} product(s) use this category. Move them first or hide the category.')
    c = db.categories.find_one({'slug': slug})
    if c:
        move_to_bin('category', 'categories', c, actor, c.get('name', slug), slug)
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
def delete_brand(slug: str, confirm: str = '', authorization: str | None = Header(None)):
    actor = allow(authorization, 'catalog')
    from .recycle import move_to_bin, check_confirm
    check_confirm(confirm)
    used = db.products.count_documents({'brand_slug': slug})
    if used:
        raise HTTPException(409, f'{used} product(s) use this brand. Move them first or hide the brand.')
    b = db.brands.find_one({'slug': slug})
    if b:
        move_to_bin('brand', 'brands', b, actor, b.get('name', slug), slug)
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
    # only products that exist; empty = the coupon works on every product
    want = list(dict.fromkeys(i for i in d.get('product_ids') or [] if ObjectId.is_valid(i)))
    d['product_ids'] = [str(p['_id']) for p in db.products.find({'_id': {'$in': [ObjectId(i) for i in want]}}, {'_id': 1})] if want else []
    return d


def parse_cart(cart: str) -> list:
    """'id:qty,id:qty' from the checkout → [{'product_id', 'quantity'}]."""
    out = []
    for part in (cart or '').split(',')[:100]:
        pid, _, q = part.partition(':')
        if ObjectId.is_valid(pid.strip()):
            try: out.append({'product_id': pid.strip(), 'quantity': max(1, min(1000, int(q or 1)))})
            except ValueError: pass
    return out


def cart_products(items: list) -> dict:
    ids = [ObjectId(i['product_id']) for i in items]
    return {str(p['_id']): p for p in db.products.find({'_id': {'$in': ids}}, {'name': 1, 'price': 1, 'sale_price': 1})} if ids else {}


def coupon_products(c) -> list:
    ids = c.get('product_ids') or []
    if not ids: return []
    return [p['name'] for p in db.products.find({'_id': {'$in': [ObjectId(i) for i in ids if ObjectId.is_valid(i)]}}, {'name': 1}).limit(6)]


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
def delete_coupon(code: str, confirm: str = '', authorization: str | None = Header(None)):
    actor = allow(authorization, 'coupons')
    from .recycle import move_to_bin, check_confirm
    check_confirm(confirm)
    c = db.coupons.find_one({'code': code.upper()})
    if c:
        move_to_bin('coupon', 'coupons', c, actor, c['code'], c.get('label') or c.get('description') or '')
    return {'ok': True}


@router.get('/api/v1/coupons/validate')
def validate_coupon(code: str, subtotal: float = 0, cart: str = '', authorization: str | None = Header(None)):
    c = db.coupons.find_one({'code': code.strip().upper(), 'active': True})
    n = now()
    if not c or (c.get('starts_at') and n < c['starts_at'].replace(tzinfo=timezone.utc)) or (c.get('ends_at') and n > c['ends_at'].replace(tzinfo=timezone.utc)):
        raise HTTPException(404, 'Coupon is invalid or expired')
    if c.get('usage_limit') and db.orders.count_documents({'coupon_code': c['code'], 'order_status': {'$nin': list(RELEASED_STATUSES)}}) >= c['usage_limit']:
        raise HTTPException(409, 'Coupon usage limit reached')
    items = parse_cart(cart)
    if items and c.get('product_ids'):
        pm = cart_products(items)
        items = [i for i in items if i['product_id'] in pm]
        if not any(coupon_applies(c, i['product_id']) for i in items):
            names = coupon_products(c)
            raise HTTPException(400, f"Coupon {c['code']} does not work on the products in your cart." + (f" It works on: {', '.join(names)}{'…' if len(c['product_ids']) > len(names) else ''}." if names else ''))
        subtotal = coupon_base(c, items, pm)
    if subtotal and subtotal < float(c.get('min_order') or 0):
        raise HTTPException(400, f"Minimum order ৳{float(c.get('min_order')):g} required for this coupon" + (' (on the products it works on)' if c.get('product_ids') else ''))
    who = optional_customer(authorization)
    if who and customer_used(c, who['sub']):
        raise HTTPException(409, f"You have already used coupon {c['code']}. Each customer can use it once.")
    return {'code': c['code'], 'type': c['type'], 'value': c['value'], 'max_discount': c.get('max_discount'),
            'min_order': c.get('min_order', 0), 'description': c.get('description', ''), 'allow_bulk': bool(c.get('allow_bulk')),
            'product_ids': c.get('product_ids') or [], 'products': coupon_products(c)}


def coupon_public(c, subtotal: float = 0, items: list | None = None):
    v = float(c['value']); cap = c.get('max_discount')
    label = (f"{v:g}% OFF" + (f" up to ৳{float(cap):,.0f}" if cap else '')) if c['type'] == 'percentage' else f"৳{v:,.0f} OFF"
    mo = float(c.get('min_order') or 0)
    fits = True
    if items and c.get('product_ids'):  # a coupon for some products only: does the cart have any of them?
        pm = cart_products(items)
        fits = any(coupon_applies(c, i['product_id']) for i in items if i['product_id'] in pm)
        subtotal = coupon_base(c, [i for i in items if i['product_id'] in pm], pm) if fits else subtotal
    return {'product_ids': c.get('product_ids') or [], 'products': coupon_products(c), 'fits_cart': fits,'code': c['code'], 'label': label, 'description': c.get('description', ''), 'min_order': mo,
            # ends_at is stored as the start of the day AFTER the last valid day
            'ends_at': c['ends_at'].replace(tzinfo=timezone.utc).isoformat() if c.get('ends_at') else None,
            'allow_bulk': bool(c.get('allow_bulk')), 'popup': c.get('promote_popup', True) is not False,
            'eligible': fits and (not subtotal or subtotal >= mo), 'short_by': max(0, mo - subtotal) if subtotal and fits else 0}


def live_coupons(extra: dict):
    n = now()
    for c in db.coupons.find({'active': True, 'show_public': {'$ne': False}, **extra}).sort([('value', -1), ('created_at', -1)]).limit(30):
        if c.get('starts_at') and n < c['starts_at'].replace(tzinfo=timezone.utc): continue
        if c.get('ends_at') and n > c['ends_at'].replace(tzinfo=timezone.utc): continue
        if c.get('usage_limit') and db.orders.count_documents({'coupon_code': c['code'], 'order_status': {'$nin': list(RELEASED_STATUSES)}}) >= c['usage_limit']: continue
        yield c


def customer_used(c, customer_id: str) -> bool:
    limit = c.get('per_customer_limit', 1)
    if not limit:
        return False
    cu = db.customers.find_one({'_id': ObjectId(customer_id)}, {'phone': 1}) if ObjectId.is_valid(customer_id) else None
    who = [{'customer_id': customer_id}] + ([{'phone': cu['phone']}] if cu and cu.get('phone') else [])
    return db.orders.count_documents({'coupon_code': c['code'], 'order_status': {'$nin': list(RELEASED_STATUSES)}, '$or': who}) >= int(limit)


@router.get('/api/v1/coupons/available')
def available_coupons(subtotal: float = 0, cart: str = '', authorization: str | None = Header(None)):
    """Coupons shown at checkout: active, in date, not used up, not secret, not already used by this customer."""
    who = optional_customer(authorization)
    items = parse_cart(cart)
    out = [coupon_public(c, subtotal, items) for c in live_coupons({}) if not (who and customer_used(c, who['sub']))][:20]
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
    # only photos this customer uploaded for this product through /reviews/photo
    photos = [u for u in dict.fromkeys(body.photos) if db.review_photos.find_one({'url': u, 'customer_id': ident['sub'], 'product_id': body.product_id})][:3]
    rv = db.reviews.insert_one({**body.model_dump(), 'photos': photos, 'product_name': p['name'], 'customer_id': ident['sub'],
                           'customer_name': (c.get('name') or 'Customer').split(' ')[0], 'verified_purchase': verified,
                           'status': 'pending', 'created_at': now()})
    from . import telegram as tg
    tg.review(db.reviews.find_one({'_id': rv.inserted_id}) or {})
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
    qd = {**body.model_dump(), 'product_name': p['name'], 'customer_id': ident['sub'] if ident else None, 'status': 'pending', 'created_at': now()}
    qd['_id'] = db.questions.insert_one(qd).inserted_id
    from . import telegram as tg
    tg.question(qd)
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
def delete_review(review_id: str, confirm: str = '', authorization: str | None = Header(None)):
    actor = allow(authorization, 'reviews')
    from .recycle import move_to_bin, check_confirm
    check_confirm(confirm)
    r = db.reviews.find_one({'_id': to_oid(review_id, 'review id')})
    if r:
        move_to_bin('review', 'reviews', r, actor, f"{r.get('rating', '')}★ {r.get('name') or r.get('customer_name') or 'Review'}", r.get('product_name', ''))
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
    note = str(payload.get('note', '')).strip()[:500]
    upd = {'status': status, 'updated_at': now(), 'status_note': note}
    if status == 'Active':
        upd['discount_approved'] = True
    hist = {'$push': {'status_history': {'at': now(), 'status': status, 'note': note, 'by': actor.get('sub')}}}
    db.dealers.update_one({'_id': oid}, {'$set': upd, **hist})
    from .notify import queue_sms, ensure_dealer_code, t_dealer_approved, t_dealer_rejected, t_dealer_suspended, t_dealer_reactivated
    n_hist = len(d.get('status_history') or []) + 1  # every status change gets its own SMS
    if status == 'Active':
        code = ensure_dealer_code(d)  # EMX-DLR-70001, 70002, … given once
        if d.get('status') == 'Suspended':
            queue_sms(f'dealer-reactivated-{dealer_id}-{n_hist}', d['phone'], t_dealer_reactivated(code), 'dealer')
        elif d.get('status') != 'Active':
            queue_sms(f'dealer-approved-{dealer_id}', d['phone'], t_dealer_approved(code), 'dealer')
    elif status == 'Suspended' and d.get('status') != 'Suspended':
        queue_sms(f'dealer-suspended-{dealer_id}-{n_hist}', d['phone'], t_dealer_suspended(d.get('dealer_code') or '', note), 'dealer')
    elif status == 'Rejected' and d.get('status') != 'Rejected':
        n = int(d.get('applications') or 1)  # a dealer can re-apply after rejection; each rejection gets its own SMS
        queue_sms(f'dealer-rejected-{dealer_id}-{n}', d['phone'], t_dealer_rejected(note), 'dealer')
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
