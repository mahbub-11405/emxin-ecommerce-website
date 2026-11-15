"""Recycle Bin: every admin delete moves the record here instead of erasing it.

A bin entry keeps the full original document (same _id), its related records (e.g. an order's ledger rows)
and the side effects that were undone (stock, customer totals). Restore puts everything back exactly as it
was, so reports, tracking and links by ID work again. "Delete forever" erases it (and the S3 file for media).
"""
from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException
from pymongo.errors import DuplicateKeyError

from .db import db
from .helpers import now, serialize
from .security import require_role
from .admin_ext import audit, recompute_rating

router = APIRouter()
BIN_ROLES = ('super_admin', 'admin')
KIND_LABEL = {'order': 'Order', 'product': 'Product', 'category': 'Category', 'brand': 'Brand', 'coupon': 'Coupon',
              'review': 'Review', 'media': 'Media file'}


def check_confirm(word):
    """Server-side guard: the admin typed DELETE in the confirm box."""
    if str(word or '').strip().lower() != 'delete':
        raise HTTPException(400, 'Type DELETE to confirm')


def bin_actor(authorization):
    return require_role(authorization, BIN_ROLES)


def _inc(coll, _id, inc):
    inc = {k: v for k, v in inc.items() if v}
    if inc and _id is not None:
        db[coll].update_one({'_id': _id}, {'$inc': inc})


def apply_effects(effects, sign=1):
    """sign=1 applies (on delete), sign=-1 reverses (on restore)."""
    for e in effects or []:
        _inc(e['collection'], e['_id'], {k: v * sign for k, v in e['inc'].items()})


def move_to_bin(kind: str, collection: str, doc: dict, actor: dict, label: str, sub: str = '',
                related: list | None = None, effects: list | None = None, extra: dict | None = None) -> str:
    """related: [(collection, [docs])] moved along with the main doc."""
    rel = [{'collection': c, 'docs': docs} for c, docs in (related or []) if docs]
    entry = {'kind': kind, 'collection': collection, 'doc_id': doc['_id'], 'doc': doc, 'related': rel, 'effects': effects or [],
             'label': label, 'sub': sub, 'deleted_by': actor.get('sub'), 'deleted_role': actor.get('role'), 'deleted_at': now(), **(extra or {})}
    bid = db.recycle_bin.insert_one(entry).inserted_id
    apply_effects(effects, 1)
    for r in rel:
        db[r['collection']].delete_many({'_id': {'$in': [d['_id'] for d in r['docs']]}})
    db[collection].delete_one({'_id': doc['_id']})
    audit(actor, f'{kind}_moved_to_bin', str(doc.get('order_id') or doc.get('slug') or doc.get('code') or doc['_id']), {'label': label, 'bin_id': str(bid)})
    return str(bid)


# ---------------------------------------------------------------- per-kind delete helpers
def bin_order(o: dict, actor: dict) -> str:
    effects = []
    if not o.get('stock_released') and not o.get('delivered_counted'):  # reserved stock goes back on the shelf
        for i in o.get('items', []):
            if ObjectId.is_valid(i.get('product_id', '')):
                effects.append({'collection': 'products', '_id': ObjectId(i['product_id']), 'inc': {'stock': i['quantity'], 'reserved': -i['quantity']}})
    elif o.get('delivered_counted'):
        for i in o.get('items', []):
            if ObjectId.is_valid(i.get('product_id', '')):
                effects.append({'collection': 'products', '_id': ObjectId(i['product_id']), 'inc': {'sold_count': -i['quantity']}})
    if o.get('customer_id') and ObjectId.is_valid(o['customer_id']):
        effects.append({'collection': 'customers', '_id': ObjectId(o['customer_id']),
                        'inc': {'total_orders': -1, 'total_purchase': -float((o.get('pricing') or {}).get('grand_total') or 0)}})
    oid = o['order_id']
    related = [('ledger', list(db.ledger.find({'order_id': oid}))), ('payment_transactions', list(db.payment_transactions.find({'order_id': oid}))),
               ('sms_outbox', list(db.sms_outbox.find({'order_id': oid}))), ('courier_webhooks', list(db.courier_webhooks.find({'order_id': oid})))]
    p = o.get('pricing') or {}
    return move_to_bin('order', 'orders', o, actor, oid, f"{o.get('customer_name', '')} · ৳{float(p.get('grand_total') or 0):,.0f} · {o.get('order_status', '')}", related, effects)


# ---------------------------------------------------------------- endpoints
@router.post('/api/v1/admin/orders/bulk-delete')
def orders_bulk_delete(payload: dict, authorization: str | None = Header(None)):
    actor = bin_actor(authorization)
    check_confirm(payload.get('confirm'))
    ids = [str(x) for x in (payload.get('order_ids') or [])][:200]
    if not ids:
        raise HTTPException(400, 'Select at least one order')
    moved = []
    for o in db.orders.find({'order_id': {'$in': ids}}):
        bin_order(o, actor)
        moved.append(o['order_id'])
    return {'ok': True, 'moved': moved, 'count': len(moved)}


def _summary(e):
    return {'_id': e['_id'], 'kind': e['kind'], 'kind_label': KIND_LABEL.get(e['kind'], e['kind'].title()), 'label': e.get('label'),
            'sub': e.get('sub'), 'doc_id': str(e.get('doc_id')), 'deleted_at': e.get('deleted_at'), 'deleted_by': e.get('deleted_by'),
            'deleted_role': e.get('deleted_role'), 'related': sum(len(r['docs']) for r in e.get('related', [])),
            'thumb': (e.get('doc') or {}).get('url') if e['kind'] == 'media' else ((e.get('doc') or {}).get('images') or [None])[0] if e['kind'] == 'product' else None}


@router.get('/api/v1/admin/recycle-bin')
def bin_list(kind: str = '', q: str = '', authorization: str | None = Header(None)):
    bin_actor(authorization)
    query = {}
    if kind:
        query['kind'] = kind
    if q.strip():
        import re
        rx = {'$regex': re.escape(q.strip()), '$options': 'i'}
        query['$or'] = [{'label': rx}, {'sub': rx}]
    rows = [_summary(e) for e in db.recycle_bin.find(query).sort('deleted_at', -1).limit(500)]
    counts = {r['_id']: r['n'] for r in db.recycle_bin.aggregate([{'$group': {'_id': '$kind', 'n': {'$sum': 1}}}])}
    return serialize({'rows': rows, 'counts': counts, 'total': sum(counts.values())})


@router.get('/api/v1/admin/recycle-bin/{bin_id}')
def bin_detail(bin_id: str, authorization: str | None = Header(None)):
    bin_actor(authorization)
    e = db.recycle_bin.find_one({'_id': ObjectId(bin_id)}) if ObjectId.is_valid(bin_id) else None
    if not e:
        raise HTTPException(404, 'Not in the Recycle Bin')
    return serialize({**_summary(e), 'doc': e.get('doc'), 'related_summary': [{'collection': r['collection'], 'count': len(r['docs'])} for r in e.get('related', [])]})


def restore_entry(e: dict, actor: dict):
    coll = e['collection']
    doc = e['doc']
    if db[coll].find_one({'_id': doc['_id']}, {'_id': 1}):
        raise HTTPException(409, f"“{e.get('label')}” already exists again — nothing to restore")
    try:
        db[coll].insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, f"Cannot restore “{e.get('label')}”: another {KIND_LABEL.get(e['kind'], 'item').lower()} now uses the same name / code. Rename or delete that one first.")
    for r in e.get('related', []):
        for d in r['docs']:
            try:
                db[r['collection']].insert_one(d)
            except DuplicateKeyError:
                pass
    apply_effects(e.get('effects'), -1)
    if e['kind'] == 'review':
        recompute_rating(doc.get('product_id'))
    db.recycle_bin.delete_one({'_id': e['_id']})
    audit(actor, f"{e['kind']}_restored", str(doc.get('order_id') or doc.get('slug') or doc.get('code') or doc['_id']), {'label': e.get('label')})


@router.post('/api/v1/admin/recycle-bin/restore')
def bin_restore(payload: dict, authorization: str | None = Header(None)):
    actor = bin_actor(authorization)
    ids = [ObjectId(i) for i in (payload.get('ids') or []) if ObjectId.is_valid(str(i))]
    if not ids:
        raise HTTPException(400, 'Select something to restore')
    restored, errors = [], []
    for e in db.recycle_bin.find({'_id': {'$in': ids}}):
        try:
            restore_entry(e, actor)
            restored.append(e.get('label'))
        except HTTPException as x:
            errors.append(x.detail)
    if errors and not restored:
        raise HTTPException(409, ' · '.join(errors))
    return {'ok': True, 'restored': restored, 'errors': errors}


@router.post('/api/v1/admin/recycle-bin/purge')
def bin_purge(payload: dict, authorization: str | None = Header(None)):
    """Delete forever. Media files are removed from S3 only now."""
    actor = bin_actor(authorization)
    check_confirm(payload.get('confirm'))
    q = {} if payload.get('all') else {'_id': {'$in': [ObjectId(i) for i in (payload.get('ids') or []) if ObjectId.is_valid(str(i))]}}
    n = 0
    for e in db.recycle_bin.find(q):
        if e['kind'] == 'media' and (e.get('doc') or {}).get('key'):
            try:
                from .main import s3_client, settings as s
                s3_client().delete_object(Bucket=s.aws_s3_bucket, Key=e['doc']['key'])
            except Exception:
                pass  # the record still goes; an orphan S3 file is harmless
        db.recycle_bin.delete_one({'_id': e['_id']})
        n += 1
    audit(actor, 'recycle_bin_purged', '', {'count': n})
    return {'ok': True, 'deleted': n}
