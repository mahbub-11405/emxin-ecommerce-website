"""People: one person = one phone number = one account.

A customer account is the base identity (name, phone, orders, CRM). Being a dealer is a role on top of it: the dealer
record is linked to the account (dealers.customer_id <-> customers.dealer_id). Someone who applies as a dealer first
gets an account at once, so every person is in Customers & CRM and can log in on the website with the same number.
Each order stores the role it was placed with (customer_type: retail / dealer), so a customer who later becomes a
dealer keeps their earlier orders as retail in every report.
"""
import re

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException

from .db import db
from .helpers import now, serialize
from .admin_ext import allow, audit, to_oid, RELEASED_STATUSES

router = APIRouter()

SHOP_TYPES = ('Retail shop', 'Wholesale', 'Distributor', 'Online seller')
LEGACY_SHOP = {'retailer': 'Retail shop', 'retail': 'Retail shop', 'wholesaler': 'Wholesale', 'wholesale': 'Wholesale',
               'distributor': 'Distributor', 'online': 'Online seller', 'online seller': 'Online seller'}
ROLE_LABEL = {'retail': 'Retail customer', 'dealer': 'Dealer', 'applicant': 'Dealer applicant', 'suspended': 'Suspended dealer'}
DEALER_FIELDS = {'status': 1, 'dealer_code': 1, 'shop_name': 1, 'business_type': 1, 'customer_id': 1, 'created_at': 1, 'approved_at': 1,
                 'applications': 1, 'phone': 1, 'name': 1, 'total_orders': 1, 'total_purchase': 1, 'discount_approved': 1,
                 'discount_override_percent': 1, 'status_note': 1}


def shop_type(v) -> str:
    s = str(v or '').strip()
    return LEGACY_SHOP.get(s.lower(), s) if s else 'Retail shop'


def role_of(dealer: dict | None) -> str:
    st = (dealer or {}).get('status')
    return {'Active': 'dealer', 'Pending': 'applicant', 'Suspended': 'suspended'}.get(st, 'retail')  # rejected = retail


def dealer_brief(d: dict | None):
    if not d:
        return None
    return {'_id': str(d['_id']), 'status': d.get('status'), 'code': d.get('dealer_code'), 'shop': d.get('shop_name'),
            'shop_type': shop_type(d.get('business_type')), 'since': d.get('approved_at'), 'applied_at': d.get('created_at'),
            'note': d.get('status_note') or ''}


# ---------------------------------------------------------------- linking
def link_dealer(d: dict) -> str:
    """Make sure a dealer has a customer account (same phone) and both point at each other. Returns the customer id."""
    phone = d.get('phone')
    if not phone:
        return ''
    c = db.customers.find_one({'phone': phone}, {'_id': 1, 'dealer_id': 1})
    if not c:
        doc = {'name': d.get('name') or d.get('shop_name') or '', 'phone': phone, 'phone_verified': True, 'account_type': 'customer',
               'source': 'dealer_application', 'lead_status': 'New Lead', 'lead_priority': 'Warm', 'total_orders': 0, 'total_purchase': 0.0,
               'address': d.get('address') or '', 'created_at': d.get('created_at') or now(), 'last_active_at': d.get('created_at') or now()}
        if d.get('email'):
            doc['email'] = str(d['email']).lower()
        cid = db.customers.insert_one(doc).inserted_id
    else:
        cid = c['_id']
    if str(c.get('dealer_id') if c else '') != str(d['_id']):
        db.customers.update_one({'_id': cid}, {'$set': {'dealer_id': str(d['_id'])}})
    if d.get('customer_id') != str(cid):
        db.dealers.update_one({'_id': d['_id']}, {'$set': {'customer_id': str(cid)}})
    return str(cid)


def migrate_people():
    """Idempotent, runs at startup: link every dealer to an account, tag old orders with their role, tidy shop types."""
    for d in db.dealers.find({'$or': [{'customer_id': {'$exists': False}}, {'customer_id': None}, {'customer_id': ''}]}):
        try:
            link_dealer(d)
        except Exception:
            pass
    db.orders.update_many({'customer_type': {'$exists': False}, 'dealer_id': {'$nin': [None, '']}}, {'$set': {'customer_type': 'dealer'}})
    db.orders.update_many({'customer_type': {'$exists': False}}, {'$set': {'customer_type': 'retail'}})
    for d in db.dealers.find({'business_type': {'$nin': list(SHOP_TYPES)}}, {'business_type': 1}):
        db.dealers.update_one({'_id': d['_id']}, {'$set': {'business_type': shop_type(d.get('business_type'))}})


# ---------------------------------------------------------------- helpers
def _dealers_by_customer():
    out = {}
    for d in db.dealers.find({}, DEALER_FIELDS):
        if d.get('customer_id'):
            out[d['customer_id']] = d
    return out


def _order_split(match: dict):
    """{customer_id: {'retail': {'n','amount'}, 'dealer': {...}}} for orders that still count."""
    out = {}
    for r in db.orders.aggregate([{'$match': {**match, 'order_status': {'$nin': list(RELEASED_STATUSES)}}},
                                  {'$group': {'_id': {'c': '$customer_id', 't': '$customer_type'}, 'n': {'$sum': 1}, 'a': {'$sum': '$pricing.grand_total'}}}]):
        k = r['_id'].get('c')
        if not k:
            continue
        t = 'dealer' if r['_id'].get('t') == 'dealer' else 'retail'
        out.setdefault(k, {'retail': {'n': 0, 'amount': 0.0}, 'dealer': {'n': 0, 'amount': 0.0}})
        out[k][t]['n'] += r['n']
        out[k][t]['amount'] += float(r['a'] or 0)
    return out


def tier_info(d: dict | None):
    """Dealer discount tier: by completed dealer orders (1st 5% · 2nd 8% · 3rd 12% · 4th+ 15%, or a fixed override)."""
    if not d or d.get('status') != 'Active':
        return None
    tiers = (db.settings.find_one({'key': 'commerce'}, {'dealer_tiers': 1}) or {}).get('dealer_tiers') or [5, 8, 12, 15]
    done = db.orders.count_documents({'dealer_id': str(d['_id']), 'order_status': {'$in': ['Delivered', 'Completed']}})
    i = min(done, len(tiers) - 1)
    fixed = d.get('discount_override_percent')
    return {'completed': done, 'tiers': tiers, 'step': i, 'current': fixed if fixed is not None else tiers[i], 'fixed': fixed is not None,
            'next': None if fixed is not None or i >= len(tiers) - 1 else tiers[i + 1], 'approved': bool(d.get('discount_approved'))}


# ---------------------------------------------------------------- list + overview
@router.get('/api/v1/admin/people')
def people(tab: str = 'all', q: str = '', authorization: str | None = Header(None)):
    allow(authorization, 'customers')
    dealers = _dealers_by_customer()
    split = _order_split({})
    proj = {'password_hash': 0, 'sales_notes': 0}
    rows, summary = [], {'retail': {'n': 0, 'amount': 0.0}, 'dealer': {'n': 0, 'amount': 0.0}, 'applicant': {'n': 0}, 'lead': {'n': 0}}
    funnel = {'registered': 0, 'ordered': 0, 'repeat': 0, 'became_dealer': 0}
    rx = re.compile(re.escape(q.strip()), re.I) if q.strip() else None
    for c in db.customers.find({}, proj).sort('last_active_at', -1).limit(3000):
        cid = str(c['_id'])
        d = dealers.get(cid)
        role = role_of(d)
        sp = split.get(cid) or {'retail': {'n': 0, 'amount': 0.0}, 'dealer': {'n': 0, 'amount': 0.0}}
        n_orders = sp['retail']['n'] + sp['dealer']['n']
        lead = n_orders == 0 and role == 'retail'
        # overview numbers (whole base, not the filtered view)
        funnel['registered'] += 1
        funnel['ordered'] += 1 if n_orders else 0
        funnel['repeat'] += 1 if n_orders >= 2 else 0
        if role == 'dealer':
            summary['dealer']['n'] += 1
            if sp['retail']['n'] or (c.get('source') != 'dealer_application' and c.get('created_at') and d.get('approved_at') and c['created_at'] < d['approved_at']):
                funnel['became_dealer'] += 1
        elif role == 'applicant':
            summary['applicant']['n'] += 1
        else:
            summary['retail']['n'] += 1
        if lead:
            summary['lead']['n'] += 1
        summary['retail']['amount'] += sp['retail']['amount']
        summary['dealer']['amount'] += sp['dealer']['amount']
        if tab == 'retail' and role not in ('retail',) or tab == 'dealer' and role not in ('dealer', 'suspended') \
                or tab == 'applicant' and role != 'applicant' or tab == 'lead' and not lead or tab == 'hot' and c.get('lead_priority') != 'Hot':
            continue
        if rx and not any(rx.search(str(x or '')) for x in (c.get('name'), c.get('phone'), c.get('email'), c.get('shop_name'), (d or {}).get('shop_name'), (d or {}).get('dealer_code'))):
            continue
        rows.append({**c, 'role': role, 'role_label': ROLE_LABEL[role], 'dealer': dealer_brief(d), 'split': sp,
                     'rejected': (d or {}).get('status') == 'Rejected', 'joined_as': 'dealer' if c.get('source') == 'dealer_application' else 'customer'})
    return serialize({'rows': rows[:1000], 'total': len(rows), 'summary': summary, 'funnel': funnel})


# ---------------------------------------------------------------- one person (360°)
def _brief_customer(c, dealers=None):
    d = (dealers or {}).get(str(c['_id'])) if dealers is not None else (db.dealers.find_one({'customer_id': str(c['_id'])}, DEALER_FIELDS))
    return {'_id': str(c['_id']), 'name': c.get('name'), 'phone': c.get('phone'), 'email': c.get('email'), 'role': role_of(d), 'dealer': dealer_brief(d)}


@router.get('/api/v1/admin/people/{customer_id}')
def person(customer_id: str, authorization: str | None = Header(None)):
    allow(authorization, 'customers')
    c = db.customers.find_one({'_id': to_oid(customer_id, 'customer id')}, {'password_hash': 0})
    if not c:
        raise HTTPException(404, 'Customer not found')
    cid = str(c['_id'])
    d = db.dealers.find_one({'customer_id': cid}, {'password_hash': 0}) or (db.dealers.find_one({'phone': c.get('phone')}, {'password_hash': 0}) if c.get('phone') else None)
    orders = list(db.orders.find({'$or': [{'customer_id': cid}] + ([{'dealer_id': str(d['_id'])}] if d else [])},
                                 {'order_id': 1, 'created_at': 1, 'order_status': 1, 'payment_status': 1, 'payment_method': 1, 'payment_channel': 1,
                                  'pricing.grand_total': 1, 'customer_type': 1, 'dealer_id': 1, 'items.quantity': 1, 'items.name': 1}).sort('created_at', -1).limit(200))
    live = [o for o in orders if o.get('order_status') not in RELEASED_STATUSES]
    amt = lambda o: float((o.get('pricing') or {}).get('grand_total') or 0)
    typ = lambda o: o.get('customer_type') or ('dealer' if o.get('dealer_id') else 'retail')
    stats = {'orders': len(live), 'spent': round(sum(amt(o) for o in live), 2), 'avg': round(sum(amt(o) for o in live) / len(live), 2) if live else 0,
             'last_order': live[0]['created_at'] if live else None,
             'retail': {'n': sum(1 for o in live if typ(o) == 'retail'), 'amount': round(sum(amt(o) for o in live if typ(o) == 'retail'), 2)},
             'dealer': {'n': sum(1 for o in live if typ(o) == 'dealer'), 'amount': round(sum(amt(o) for o in live if typ(o) == 'dealer'), 2)},
             'cancelled': len(orders) - len(live)}
    # journey: the person's story in order
    j = [{'at': c.get('created_at'), 'kind': 'join', 'text': 'Account created when applying as a dealer' if c.get('source') == 'dealer_application' else 'Registered on the website'}]
    first = {}
    for o in reversed(orders):
        t = typ(o)
        if t not in first and o.get('order_status') not in RELEASED_STATUSES:
            first[t] = o
            j.append({'at': o['created_at'], 'kind': 'order', 'text': f"First {'dealer' if t == 'dealer' else 'retail'} order #{o['order_id']} · ৳{amt(o):,.0f}"})
    if d:
        j.append({'at': d.get('created_at'), 'kind': 'apply', 'text': f"Applied as dealer · {d.get('shop_name') or ''}".strip(' ·')})
        for h in d.get('status_history') or []:
            st = h.get('status')
            if st == 'Pending' and 'again' in str(h.get('note', '')).lower():
                j.append({'at': h.get('at'), 'kind': 'apply', 'text': h.get('note')})
            elif st in ('Active', 'Rejected', 'Suspended'):
                j.append({'at': h.get('at'), 'kind': st.lower(), 'text': {'Active': f"Approved as dealer{' · ' + d['dealer_code'] if d.get('dealer_code') else ''}",
                                                                         'Rejected': 'Dealer application rejected' + (f" — {h.get('note')}" if h.get('note') else ''),
                                                                         'Suspended': 'Dealer account suspended' + (f" — {h.get('note')}" if h.get('note') else '')}[st]})
        if d.get('approved_at') and not any(x['kind'] == 'active' for x in j):
            j.append({'at': d['approved_at'], 'kind': 'active', 'text': f"Approved as dealer{' · ' + d['dealer_code'] if d.get('dealer_code') else ''}"})
    j = sorted([x for x in j if x.get('at')], key=lambda x: x['at'])
    # linked accounts (same person, other number) + suggestions
    linked_ids = [ObjectId(x) for x in (c.get('linked_ids') or []) if ObjectId.is_valid(x)]
    dmap = _dealers_by_customer()
    linked = [_brief_customer(x, dmap) for x in db.customers.find({'_id': {'$in': linked_ids}}, {'name': 1, 'phone': 1, 'email': 1})]
    alts = []
    if c.get('email'):
        alts.append({'email': c['email']})
    nm = (c.get('name') or '').strip()
    if len(nm) >= 3:
        alts.append({'name': {'$regex': f'^{re.escape(nm)}$', '$options': 'i'}})
    matches = []
    if alts:
        for x in db.customers.find({'$or': alts, '_id': {'$nin': [c['_id']] + linked_ids}}, {'name': 1, 'phone': 1, 'email': 1}).limit(5):
            b = _brief_customer(x, dmap)
            b['why'] = 'same email' if c.get('email') and x.get('email') == c.get('email') else 'same name'
            matches.append(b)
    activity = list(db.analytics_events.find({'customer_id': cid}).sort('created_at', -1).limit(10))
    return serialize({'customer': c, 'role': role_of(d), 'role_label': ROLE_LABEL[role_of(d)], 'dealer': {**dealer_brief(d), 'raw': d} if d else None,
                      'rejected': (d or {}).get('status') == 'Rejected', 'tier': tier_info(d), 'stats': stats, 'journey': j,
                      'orders': orders[:50], 'linked': linked, 'matches': matches, 'activity': activity})


@router.post('/api/v1/admin/people/{customer_id}/link')
def link_person(customer_id: str, payload: dict, authorization: str | None = Header(None)):
    """Mark two accounts (different numbers) as the same person. Nothing is merged: each keeps its orders and login."""
    actor = allow(authorization, 'customers')
    a, b = to_oid(customer_id, 'customer id'), to_oid(str(payload.get('other_id') or ''), 'other id')
    if a == b:
        raise HTTPException(400, 'Pick a different account')
    if db.customers.count_documents({'_id': {'$in': [a, b]}}) != 2:
        raise HTTPException(404, 'Account not found')
    unlink = bool(payload.get('unlink'))
    op = '$pull' if unlink else '$addToSet'
    db.customers.update_one({'_id': a}, {op: {'linked_ids': str(b)}})
    db.customers.update_one({'_id': b}, {op: {'linked_ids': str(a)}})
    audit(actor, 'people_unlinked' if unlink else 'people_linked', str(a), {'other': str(b)})
    return {'ok': True}


def enrich_dealers(rows: list) -> list:
    """Dealers page: shop type, the website account behind each dealer, retail history and tier."""
    cids = [ObjectId(d['customer_id']) for d in rows if ObjectId.is_valid(str(d.get('customer_id') or ''))]
    cust = {str(c['_id']): c for c in db.customers.find({'_id': {'$in': cids}}, {'created_at': 1, 'source': 1, 'name': 1})}
    split = _order_split({'customer_id': {'$in': list(cust)}}) if cust else {}
    tiers = (db.settings.find_one({'key': 'commerce'}, {'dealer_tiers': 1}) or {}).get('dealer_tiers') or [5, 8, 12, 15]
    done = {r['_id']: r['n'] for r in db.orders.aggregate([{'$match': {'dealer_id': {'$in': [str(d['_id']) for d in rows]}, 'order_status': {'$in': ['Delivered', 'Completed']}}},
                                                          {'$group': {'_id': '$dealer_id', 'n': {'$sum': 1}}}])}
    for d in rows:
        d['shop_type'] = shop_type(d.get('business_type'))
        c = cust.get(str(d.get('customer_id') or ''))
        sp = split.get(str(d.get('customer_id') or '')) or {'retail': {'n': 0, 'amount': 0.0}, 'dealer': {'n': 0, 'amount': 0.0}}
        d['dealer_orders'] = sp['dealer']  # every live dealer order (pending ones too), not only delivered
        d['account'] = {'customer_id': d.get('customer_id'), 'since': c.get('created_at') if c else None,
                        'joined_as': 'dealer' if (c or {}).get('source') == 'dealer_application' else 'customer', 'retail_orders': sp['retail']['n'],
                        'retail_amount': sp['retail']['amount']} if c else None
        n = done.get(str(d['_id']), 0)
        i = min(n, len(tiers) - 1)
        fixed = d.get('discount_override_percent')
        d['tier'] = {'completed': n, 'step': i, 'tiers': tiers, 'current': fixed if fixed is not None else tiers[i], 'fixed': fixed is not None,
                     'next': None if fixed is not None or i >= len(tiers) - 1 else tiers[i + 1]} if d.get('status') == 'Active' else None
    return rows
