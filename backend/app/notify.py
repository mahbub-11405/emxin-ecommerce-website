"""Customer / dealer SMS (besides OTP): templates, a MongoDB outbox and a background sender.

Every SMS is first written to db.sms_outbox with a unique event_key (so the same event never sends twice),
then a worker thread sends it within a few seconds and retries failures (3 tries). Admin → Marketing shows the log.
All texts are plain English/ASCII so each one is a single normal SMS (no Unicode).
"""
import logging, threading, time
from datetime import timedelta
from pymongo import ReturnDocument
from .config import get_settings
from .db import db
from .helpers import now
from .integrations import BulkSmsBdClient, sms_parts

settings=get_settings(); log=logging.getLogger('emxin.sms')
MAX_TRIES=3

def tk(n) -> str: return 'Tk ' + f"{float(n or 0):,.0f}"

# ---------- templates (keep ASCII; ~160 chars max) ----------
def t_dealer_applied() -> str:
    return 'EMXIN: Your dealer application is received. We will review it and SMS you when it is approved. Thank you.'
def t_dealer_approved(code: str) -> str:
    return f'EMXIN: Congratulations! Your dealer account is approved. Dealer ID: {code}. Use this ID when you order or call us. {settings.site_domain}/dealer'
def t_dealer_rejected() -> str:
    return 'EMXIN: Sorry, your dealer application was not approved at this time. Please call us for details.'
def t_order_confirmed(o: dict) -> str:
    p=o.get('pricing') or {}; due=float(p.get('cod_due') or 0); paid=float(p.get('grand_total') or 0)-due
    money=(f'Paid {tk(paid)}, due {tk(due)} on delivery.' if paid>0 and due>0 else f'Pay {tk(due)} on delivery.' if due>0 else f'Paid {tk(paid)}.')
    return f"EMXIN: Your order {o['order_id']} is confirmed. {money} Ships by courier soon. Track: {settings.site_domain}/track-order"
def t_payment_rejected(o: dict) -> str:
    return f"EMXIN: We could not verify the payment for order {o['order_id']}. Please send the correct TrxID from My Orders at {settings.site_domain}/account"

# ---------- dealer ID: EMX-DLR-70001, 70002, ... ----------
def next_dealer_code() -> str:
    c=db.counters.find_one_and_update({'_id':'dealer_code'},{'$inc':{'seq':1},'$setOnInsert':{'start':70000}},upsert=True,return_document=ReturnDocument.AFTER)
    return f"EMX-DLR-{70000+int(c['seq'])}"
def ensure_dealer_code(dealer: dict) -> str:
    if dealer.get('dealer_code'): return dealer['dealer_code']
    code=next_dealer_code()
    r=db.dealers.update_one({'_id':dealer['_id'],'dealer_code':{'$exists':False}},{'$set':{'dealer_code':code,'dealer_code_at':now()}})
    return code if r.modified_count else (db.dealers.find_one({'_id':dealer['_id']},{'dealer_code':1}) or {}).get('dealer_code',code)

# ---------- outbox ----------
def queue_sms(event_key: str, phone: str, message: str, kind: str='transactional', **extra) -> bool:
    """Adds one SMS to the outbox (ignored if this event_key was already queued). Returns True if newly queued."""
    if not phone or not message: return False
    r=db.sms_outbox.update_one({'event_key':event_key},{'$setOnInsert':{'event_key':event_key,'phone':phone,'message':message,'kind':kind,'parts':sms_parts(message),
        'status':'pending','tries':0,'created_at':now(),**extra}},upsert=True)
    if r.upserted_id: wake()
    return bool(r.upserted_id)

def expire_stale():
    # an 'order confirmed' SMS a day late is confusing — old unsent items are marked expired, never sent
    db.sms_outbox.update_many({'status':{'$in':['pending','retry']},'created_at':{'$lt':now()-timedelta(hours=24)}},{'$set':{'status':'expired'}})

def send_one(item: dict) -> bool:
    try:
        BulkSmsBdClient().send_sync(item['phone'],item['message'])
        db.sms_outbox.update_one({'_id':item['_id']},{'$set':{'status':'sent','sent_at':now()},'$unset':{'error':''}}); return True
    except Exception as e:
        tries=int(item.get('tries',0))
        st='failed' if tries>=MAX_TRIES else 'retry'
        db.sms_outbox.update_one({'_id':item['_id']},{'$set':{'status':st,'error':str(e)[:250],'next_try_at':now()+timedelta(minutes=2*tries)}})
        log.warning('sms %s failed (%s/%s): %s',item.get('event_key'),tries,MAX_TRIES,e); return False

def dispatch(limit: int=20) -> dict:
    """Sends due outbox items. Atomic claim, so two workers never send the same SMS."""
    sent=failed=0
    if not settings.sms_enabled: return {'sent':0,'failed':0,'disabled':True}
    expire_stale()
    for _ in range(limit):
        item=db.sms_outbox.find_one_and_update(
            {'status':{'$in':['pending','retry']},'$or':[{'next_try_at':{'$exists':False}},{'next_try_at':{'$lte':now()}}]},
            {'$set':{'status':'sending','last_attempt_at':now()},'$inc':{'tries':1}},sort=[('created_at',1)],return_document=ReturnDocument.AFTER)
        if not item: break
        if send_one(item): sent+=1
        else: failed+=1
    return {'sent':sent,'failed':failed}

_event=threading.Event(); _started=False
def wake(): _event.set()
def _loop():
    # items stuck in 'sending' (e.g. server restarted mid-send) go back to retry
    db.sms_outbox.update_many({'status':'sending','last_attempt_at':{'$lt':now()-timedelta(minutes=5)}},{'$set':{'status':'retry'}})
    expire_stale()
    while True:
        try: dispatch(50)
        except Exception: log.exception('sms worker error')
        _event.wait(60); _event.clear(); time.sleep(1)
def start_worker():
    global _started
    if _started or not settings.sms_enabled: return
    _started=True; threading.Thread(target=_loop,name='sms-outbox',daemon=True).start()
