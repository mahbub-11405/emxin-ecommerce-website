"""The visitor's real IP address behind host Nginx and (optionally) Cloudflare.

Nginx appends the address it saw to X-Forwarded-For, so the last entry is the direct peer. When that peer is a
Cloudflare edge server, the visitor's address is in CF-Connecting-IP. The header is trusted only in that case, so
nobody can fake an IP by sending the header straight to the server. Used for OTP limits and Facebook ads matching.
"""
import ipaddress
from functools import lru_cache

# https://www.cloudflare.com/ips/ (update if Cloudflare publishes new ranges)
CLOUDFLARE = ('173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
              '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
              '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22', '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32',
              '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32')
_NETS = [ipaddress.ip_network(n) for n in CLOUDFLARE]


@lru_cache(maxsize=4096)
def is_cloudflare(ip: str) -> bool:
    try: a = ipaddress.ip_address(ip)
    except ValueError: return False
    return any(a in n for n in _NETS if n.version == a.version)


def real_ip(request) -> str:
    xff = [x.strip() for x in (request.headers.get('x-forwarded-for') or '').split(',') if x.strip()]
    peer = xff[-1] if xff else (request.client.host if request.client else '')
    cf = (request.headers.get('cf-connecting-ip') or '').strip()
    if cf and is_cloudflare(peer):
        try: return str(ipaddress.ip_address(cf))
        except ValueError: pass
    return peer
