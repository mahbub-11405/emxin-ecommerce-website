import base64, hashlib, hmac, os
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import HTTPException, Header
from .config import get_settings

settings=get_settings()

def hash_password(password: str) -> str:
    salt=os.urandom(16)
    digest=hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 220_000)
    return base64.b64encode(salt+digest).decode()

def verify_password(password: str, encoded: str) -> bool:
    raw=base64.b64decode(encoded.encode()); salt, expected=raw[:16],raw[16:]
    actual=hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 220_000)
    return hmac.compare_digest(actual, expected)

def create_token(subject: str, role: str) -> str:
    now=datetime.now(timezone.utc)
    return jwt.encode({'sub':subject,'role':role,'iat':now,'exp':now+timedelta(minutes=settings.jwt_expire_minutes)}, settings.app_secret, algorithm='HS256')

def decode_token(token: str):
    try: return jwt.decode(token, settings.app_secret, algorithms=['HS256'])
    except Exception: raise HTTPException(status_code=401, detail='Invalid or expired token')

def require_role(authorization: str|None, roles: tuple[str,...]):
    if not authorization or not authorization.startswith('Bearer '): raise HTTPException(401,'Authentication required')
    payload=decode_token(authorization.split(' ',1)[1])
    if payload.get('role') not in roles: raise HTTPException(403,'Insufficient permission')
    return payload
