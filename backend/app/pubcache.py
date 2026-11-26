"""Short-lived memory cache for public shop data, dropped as soon as something it shows is written."""
import functools as _ft, time as _time
from .db import public_version as _pubv
_PUB: dict = {}
def pub_cached(ttl: int):
    """Public shop data (homepage, products, categories…) is kept in memory and reused until anything it shows is
    written (public_version changes) or `ttl` seconds pass. One answer instead of ~10 database trips per visitor."""
    def deco(fn):
        @_ft.wraps(fn)
        def wrap(*a, **kw):
            key = (fn.__name__, tuple(sorted(kw.items())))
            hit = _PUB.get(key); v = _pubv[0]; t = _time.monotonic()
            if hit and hit[0] == v and t - hit[1] < ttl: return hit[2]
            val = fn(*a, **kw)
            if len(_PUB) > 500: _PUB.clear()
            _PUB[key] = (v, t, val); return val
        return wrap
    return deco
