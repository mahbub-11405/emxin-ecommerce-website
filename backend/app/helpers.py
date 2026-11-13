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

STOP_WORDS={'and','the','of','for','with','ai','camera'}
def category_code(cat: dict|None) -> str:
    """Short code for a category: the saved code, else made from the name outside brackets.
    Smart Glasses -> SMG · Smart Eye Glasses -> SEG · Smart Sun Glasses -> SSG · Frames -> FRA"""
    import re
    if not cat: return 'GEN'
    if cat.get('code'): return re.sub(r'[^A-Z0-9]','',cat['code'].upper())[:5] or 'GEN'
    words=[w for w in re.findall(r'[A-Za-z0-9]+',re.sub(r'\(.*?\)','',cat.get('name') or '')) if w.lower() not in STOP_WORDS]
    if not words: return 'GEN'
    if len(words)>=3: c=''.join(w[0] for w in words[:3])
    elif len(words)==2: c=words[0][:2]+words[1][0]
    else: c=words[0][:3]
    return c.upper()

def code_part(v: str, n: int) -> str:
    import re
    return re.sub(r'[^A-Z0-9]','',(v or '').upper())[:n]

def next_product_codes(db, category_slug: str='', brand_slug: str='', model: str='', exclude_id=None):
    """Suggested codes for a product.
    Stock bar code: EMXIN-<CAT>-<5-digit serial per category>  e.g. EMXIN-SSG-00003
    SKU:            EMX-<CAT>-<BRAND>-<MODEL>                 e.g. EMX-SSG-TXK-MR1 (unique; -2, -3 … added if needed)"""
    import re
    cat=db.categories.find_one({'slug':category_slug}) if category_slug else None
    cc=category_code(cat)
    prefix=f'EMXIN-{cc}-'
    q={'compare_note':{'$regex':'^'+re.escape(prefix)+r'\d+$'}}
    if exclude_id: q['_id']={'$ne':exclude_id}
    nums=[int(d['compare_note'][len(prefix):]) for d in db.products.find(q,{'compare_note':1})]
    stock=f'{prefix}{(max(nums)+1 if nums else 1):05d}'
    brand=db.brands.find_one({'slug':brand_slug}) if brand_slug else None
    bc=code_part((brand or {}).get('slug') or brand_slug or 'GEN',6) or 'GEN'
    mc=code_part(model,10)
    base='-'.join(x for x in ['EMX',cc,bc,mc] if x)
    if not mc:  # no model yet: number it inside the category + brand
        q2={'sku':{'$regex':'^'+re.escape(base)+r'-\d+$'}}
        if exclude_id: q2['_id']={'$ne':exclude_id}
        n=[int(d['sku'].rsplit('-',1)[1]) for d in db.products.find(q2,{'sku':1})]
        sku=f'{base}-{(max(n)+1 if n else 1):03d}'
    else:
        sku=base; i=2
        while db.products.find_one({'sku':sku,**({'_id':{'$ne':exclude_id}} if exclude_id else {})},{'_id':1}): sku=f'{base}-{i}'; i+=1
    return {'sku':sku,'compare_note':stock,'category_code':cc}

def product_slug(name: str, model: str='') -> str:
    """URL slug from name + model, e.g. TXK + MR-1 -> txk-mr-1 (model left out if the name already contains it)."""
    n,m=slugify(name or ''),slugify(model or '')
    return n if not m or m in n else f'{n}-{m}'
