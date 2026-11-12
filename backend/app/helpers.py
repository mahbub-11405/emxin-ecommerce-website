from datetime import datetime, timezone
from bson import ObjectId

def now(): return datetime.now(timezone.utc)
def oid(value): return ObjectId(value)
def serialize(doc):
    if doc is None: return None
    if isinstance(doc, list): return [serialize(x) for x in doc]
    out={}
    for k,v in doc.items():
        if isinstance(v,ObjectId): v=str(v)
        elif isinstance(v,datetime): v=v.isoformat()
        elif isinstance(v,dict): v=serialize(v)
        elif isinstance(v,list): v=[serialize(x) if isinstance(x,dict) else (str(x) if isinstance(x,ObjectId) else x) for x in v]
        out[k]=v
    return out

def slugify(s: str):
    import re
    s=s.strip().lower().replace('&','and')
    return re.sub(r'[^a-z0-9]+','-',s).strip('-')

def next_code(values, default=''):
    """Next code in a numbered series, e.g. ['EMXIN-SMG-00001'] -> 'EMXIN-SMG-00002'.
    `values` should be newest first; the newest numbered value sets the prefix, and the
    highest number used with that prefix is incremented (zero padding is kept)."""
    import re
    parsed=[m for m in (re.match(r'^(.*?)(\d+)$', (v or '').strip()) for v in values) if m]
    if not parsed: return default
    prefix=parsed[0].group(1)
    nums=[m.group(2) for m in parsed if m.group(1)==prefix]
    width=max(len(n) for n in nums); n=max(int(x) for x in nums)+1
    return f'{prefix}{str(n).zfill(width)}'

def next_product_codes(db):
    """Suggested SKU and stock-bar code for the next new product."""
    docs=list(db.products.find({}, {'sku':1,'compare_note':1}).sort('created_at',-1).limit(500))
    return {'sku': next_code([d.get('sku') for d in docs], 'EMXIN-0001'),
            'compare_note': next_code([d.get('compare_note') for d in docs], '')}
