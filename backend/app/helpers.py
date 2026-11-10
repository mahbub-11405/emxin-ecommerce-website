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
