from fastapi import FastAPI, HTTPException, Header, Query, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from pymongo import ReturnDocument
from bson import ObjectId
from datetime import datetime, timedelta, timezone
import secrets, re, hashlib, hmac, uuid, mimetypes, logging
log=logging.getLogger('emxin')
from zoneinfo import ZoneInfo as _ZI
DHAKA=_ZI('Asia/Dhaka')
from zoneinfo import ZoneInfo
from .config import get_settings
from .db import db, client, ensure_indexes
from .helpers import serialize, now, slugify, next_product_codes, product_slug
from .security import hash_password, verify_password, create_token, require_role, decode_token
from .schemas import *
from .pricing import calculate
from .integrations import send_sms, sms_parts, PayStationClient, SteadfastClient, PathaoClient, IntegrationNotConfigured
from .admin_ext import router as v2_router, release_stock
from .media_optimize import queue_video, big_images, optimize_existing_images
from .notify import queue_sms, dispatch as sms_dispatch, start_worker as start_sms_worker, ensure_dealer_code, t_dealer_applied, t_dealer_approved, t_dealer_reactivated, t_order_confirmed, t_payment_rejected, t_order_cancelled

settings=get_settings()
app=FastAPI(title='EMXIN REST API',version='1.0.0',openapi_url='/api/v1/openapi.json',docs_url='/docs')
app.add_middleware(CORSMiddleware,allow_origins=settings.origins,allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
from fastapi.middleware.gzip import GZipMiddleware
import time as _time
LIVE_PATH='/api/v1/admin/live'
class Speed:
    """gzip for normal responses (JSON lists shrink ~80%) + Server-Timing header (browser Network tab) + a log line for
    any request slower than 1 s. The live stream is passed through untouched, so its messages are never held back."""
    def __init__(self,app): self.app=app; self.gz=GZipMiddleware(app,minimum_size=800)
    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or scope['path']==LIVE_PATH: return await self.app(scope,receive,send)
        t=_time.perf_counter()
        async def timed(msg):
            if msg['type']=='http.response.start':
                ms=(_time.perf_counter()-t)*1000
                msg['headers']=list(msg.get('headers') or [])+[(b'server-timing',f'app;dur={ms:.0f}'.encode())]
                if ms>1000: log.warning('slow %s %s %.0f ms',scope.get('method'),scope['path'],ms)
            await send(msg)
        await self.gz(scope,receive,timed)
app.add_middleware(Speed)
app.include_router(v2_router)
from .courier import router as courier_router, steadfast_create, start_courier_sync
app.include_router(courier_router)
from .recycle import router as recycle_router
app.include_router(recycle_router)
from .people import router as people_router, link_dealer, migrate_people, shop_type, enrich_dealers
app.include_router(people_router)

@app.on_event('startup')
def startup():
    client.admin.command('ping'); ensure_indexes(); start_sms_worker(); start_courier_sync(); paystation_orders_to_cod(); migrate_people()
    if not db.admins.find_one({'email':settings.initial_admin_email.lower()}):
        db.admins.insert_one({'email':settings.initial_admin_email.lower(),'password_hash':hash_password(settings.initial_admin_password),'role':'super_admin','created_at':now()})
    if not db.settings.find_one({'key':'commerce'}):
        db.settings.insert_one({'key':'commerce','dhaka_delivery_charge':settings.dhaka_delivery_charge,'outside_dhaka_delivery_charge':settings.outside_dhaka_delivery_charge,'estimated_shipping_from_qty':settings.estimated_shipping_from_qty,'extra_shipping_per_kg':settings.extra_shipping_per_kg,'bulk_threshold_qty':settings.bulk_threshold_qty,'bulk_discount_percent':settings.bulk_discount_percent,'bulk_advance_percent':settings.bulk_advance_percent,'digital_payment_discount_percent':settings.digital_payment_discount_percent,'payment_accounts':{'bkash':{'enabled':bool(settings.payment_bkash_number),'number':settings.payment_bkash_number,'account_type':settings.payment_bkash_account_type},'nagad':{'enabled':bool(settings.payment_nagad_number),'number':settings.payment_nagad_number,'account_type':settings.payment_nagad_account_type},'bank':{'enabled':bool(settings.payment_bank_account_number),'bank_name':settings.payment_bank_name,'account_name':settings.payment_bank_account_name,'account_number':settings.payment_bank_account_number,'branch':settings.payment_bank_branch,'routing_number':settings.payment_bank_routing_number}},'return_label':'Conditional Return','updated_at':now()})
    if not db.homepage.find_one({'key':'home'}):
        db.homepage.insert_one({'key':'home','hero':{'title':'Smart Gadgets. Smarter Living.','title_bn':'স্মার্ট গ্যাজেটস। স্মার্টার লিভিং।','subtitle':'Discover smart eyewear, sunglasses and frames.','subtitle_bn':'স্মার্ট গ্লাস, সানগ্লাস ও ফ্রেম এক জায়গায়।','cta':'Shop Now','cta_bn':'শপ করুন','image':''},'sections':['trust','featured','categories','promo','best_sellers'],'promo':{'title':'New Collection','subtitle':'Fresh arrivals from EMXIN','image':'','cta':'Explore Collection'},'updated_at':now()})

@app.get('/health')
def health():
    try: client.admin.command('ping'); db_ok=True
    except Exception: db_ok=False
    return {'status':'ok' if db_ok else 'degraded','database':db_ok}

# ---------- OTP / SMS ----------
def normalize_bd_phone(phone: str):
    p=re.sub(r'\D','',phone or '')
    if p.startswith('880'): p='+'+p
    elif p.startswith('0'): p='+88'+p
    elif p.startswith('1'): p='+880'+p
    if not re.fullmatch(r'\+8801[3-9]\d{8}',p): raise HTTPException(400,'Valid Bangladesh mobile number required')
    return p

def otp_hash(phone,purpose,code):
    return hmac.new(settings.app_secret.encode(),f'{phone}|{purpose}|{code}'.encode(),hashlib.sha256).hexdigest()

def client_ip(request: Request) -> str:
    # Behind the reverse proxy the real visitor IP is the last X-Forwarded-For entry the proxy added.
    xff=[x.strip() for x in (request.headers.get('x-forwarded-for') or '').split(',') if x.strip()]
    return xff[-1] if xff else (request.client.host if request.client else '')

def otp_message(code: str) -> str:
    return settings.otp_sms_template.replace('\\n','\n').format(OTP=code,MINUTES=max(1,settings.otp_expire_seconds//60),DOMAIN=settings.site_domain)

def dealer_block(phone: str, lang: str='bn'):
    """Why this number cannot apply as a dealer (None = it can: new number or a rejected application)."""
    d=db.dealers.find_one({'phone':phone},{'status':1,'dealer_code':1})
    bn=lang=='bn'
    if not d:  # deleted by EMXIN: it waits in the Recycle Bin. Nothing new is saved; EMXIN restores it if needed.
        b=db.recycle_bin.find_one({'kind':'dealer','doc.phone':phone},{'doc.dealer_code':1})
        if b: d={'status':'Suspended','dealer_code':(b.get('doc') or {}).get('dealer_code')}
    if not d or d.get('status')=='Rejected': return None
    st=d.get('status'); code=d.get('dealer_code')
    if st=='Active':
        return ('এই নম্বরটি ইতিমধ্যে EMXIN ডিলার হিসেবে অনুমোদিত'+(f' (Dealer ID: {code})' if code else '')+'। নতুন আবেদনের দরকার নেই।') if bn else \
               ('This number is already an approved EMXIN dealer'+(f' (Dealer ID: {code})' if code else '')+'. No need to apply again.')
    if st=='Suspended':
        return (f'আপনার Dealer ID{" ("+code+")" if code else ""} স্থগিত (suspended) আছে। নতুন আবেদন করা যাবে না। সমাধানের জন্য EMXIN-এর সাথে যোগাযোগ করুন।') if bn else \
               (f'Your dealer ID{" ("+code+")" if code else ""} is suspended, so you cannot apply again. Please contact EMXIN for a solution.')
    return 'এই নম্বর দিয়ে আপনার আবেদন আগেই জমা হয়েছে এবং এখন যাচাই চলছে। অনুমোদন হলে আমরা SMS-এ জানাব।' if bn else \
           'You have already applied with this number and it is under review. We will SMS you once it is approved.'

@app.post('/api/v1/auth/otp/request')
async def request_otp(body: OTPRequest, request: Request):
    phone=normalize_bd_phone(body.phone); now_dt=now(); ip=client_ip(request)
    if body.purpose=='login' and not db.customers.find_one({'phone':phone},{'_id':1}):
        raise HTTPException(404,'No account found for this number. Please register first.')
    if body.purpose=='customer_register' and db.customers.find_one({'phone':phone},{'_id':1}):
        raise HTTPException(409,'This number is already registered. Please log in.')
    if body.purpose=='dealer_register' and (why:=dealer_block(phone,body.language)):
        raise HTTPException(409,why)  # checked before the OTP so no SMS credit is spent
    if settings.app_env=='production' and not settings.sms_enabled:
        raise HTTPException(503,'SMS verification is not available right now. Please try again later.')
    # ---- limits: 60 s between sends · 5 per number per hour · per-IP and daily caps (each send, incl. resend, costs 1 SMS)
    previous=db.otp_challenges.find_one({'phone':phone},sort=[('created_at',-1)])
    if previous:
        wait=settings.otp_resend_seconds-int((now_dt-previous['created_at']).total_seconds())
        if wait>0: raise HTTPException(429,f'Please wait {wait} seconds before requesting another code')
    hour=now_dt-timedelta(hours=1)
    if db.otp_challenges.count_documents({'phone':phone,'created_at':{'$gte':hour}})>=settings.otp_max_per_phone_hour:
        raise HTTPException(429,'Too many codes for this number. Please try again in an hour.')
    if ip and db.otp_challenges.count_documents({'ip':ip,'created_at':{'$gte':hour}})>=settings.otp_max_per_ip_hour:
        raise HTTPException(429,'Too many requests. Please try again later.')
    if db.otp_challenges.count_documents({'created_at':{'$gte':now_dt-timedelta(days=1)}})>=settings.otp_max_per_day:
        raise HTTPException(429,'Verification is busy right now. Please try again later or contact EMXIN.')
    code=f'{secrets.randbelow(1000000):06d}'; challenge_id=str(uuid.uuid4())
    expires=now_dt+timedelta(seconds=settings.otp_expire_seconds)
    # the code itself is never stored — only an HMAC-SHA256 hash keyed with APP_SECRET
    doc={'challenge_id':challenge_id,'phone':phone,'purpose':body.purpose,'code_hash':otp_hash(phone,body.purpose,code),'attempts':0,'verified':False,'ip':ip,'created_at':now_dt,'expires_at':expires}
    db.otp_challenges.insert_one(doc)
    response={'challenge_id':challenge_id,'expires_in':settings.otp_expire_seconds,'resend_in':settings.otp_resend_seconds}
    if settings.sms_enabled:
        try: await send_sms(phone,otp_message(code))
        except Exception as e:
            log.error('OTP SMS failed for %s…: %s',phone[:6],str(e)[:300])  # real BulkSMSBD reason → docker compose logs backend
            db.otp_challenges.delete_one({'challenge_id':challenge_id})
            raise HTTPException(503,'Could not send the SMS. Please try again in a minute.')
    elif settings.app_env!='production' and settings.otp_expose_code_in_test:
        response['test_code']=code  # development only: no SMS provider set, code shown on screen
    return response

@app.post('/api/v1/auth/otp/verify')
def verify_otp(body: OTPVerify):
    phone=normalize_bd_phone(body.phone)
    c=db.otp_challenges.find_one({'phone':phone,'purpose':body.purpose,'verified':False},sort=[('created_at',-1)])
    if not c or c['expires_at']<now(): raise HTTPException(400,'This code has expired. Please request a new one.')
    # count the attempt first (atomic), so parallel guesses can't get past the limit
    c=db.otp_challenges.find_one_and_update({'_id':c['_id'],'attempts':{'$lt':settings.otp_max_attempts}},{'$inc':{'attempts':1}},return_document=ReturnDocument.AFTER)
    if not c: raise HTTPException(429,'Too many wrong codes. Please request a new code.')
    if not hmac.compare_digest(c['code_hash'],otp_hash(phone,body.purpose,re.sub(r'\D','',body.code))):
        left=settings.otp_max_attempts-c['attempts']
        raise HTTPException(400,f'Incorrect code. {left} attempt(s) left.' if left>0 else 'Too many wrong codes. Please request a new code.')
    verification_id=str(uuid.uuid4())
    db.otp_challenges.update_one({'_id':c['_id']},{'$set':{'verified':True,'verified_at':now(),'verification_id':verification_id}})
    return {'verified':True,'verification_id':verification_id}

def consume_phone_verification(phone,purpose,verification_id):
    if not verification_id: return False
    c=db.otp_challenges.find_one({'phone':normalize_bd_phone(phone),'purpose':purpose,'verification_id':verification_id,'verified':True,'consumed':{'$ne':True},
                                  'verified_at':{'$gte':now()-timedelta(minutes=settings.otp_verification_valid_minutes)}})
    if not c:return False
    result=db.otp_challenges.update_one({'_id':c['_id'],'consumed':{'$ne':True}},{'$set':{'consumed':True,'consumed_at':now()}})
    return result.modified_count == 1

# ---------- Media / S3 ----------
def s3_client():
    if not settings.aws_s3_bucket: raise HTTPException(503,'S3 bucket is not configured')
    import boto3
    return boto3.client('s3',region_name=settings.aws_region,aws_access_key_id=settings.aws_access_key_id or None,aws_secret_access_key=settings.aws_secret_access_key or None)

def media_public_url(key):
    base=(settings.aws_cdn_base_url or '').rstrip('/')
    if not base and settings.aws_cloudfront_domain:
        base='https://' + settings.aws_cloudfront_domain.strip().removeprefix('https://').removeprefix('http://').rstrip('/')
    return f'{base}/{key}' if base else f'https://{settings.aws_s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}'

# ---------- Public CMS / catalog ----------
PRODUCT_SORTS=('price_asc','price_desc','manual','newest')
def eff_price(p): return float(p.get('sale_price') or p.get('price') or 0)
def ts(p):
    t=p.get('created_at'); return t.timestamp() if hasattr(t,'timestamp') else 0
def sort_products(rows:list,mode:str|None=None)->list:
    """Order chosen in Admin → Homepage Builder → Product order. Used by the homepage and the shop's default order.
    manual = Sort order 1,2,3… first (0 = no preference goes last, cheapest first); price_* uses the selling price (sale price if set)."""
    mode=mode or (db.homepage.find_one({'key':'home'},{'product_sort':1}) or {}).get('product_sort') or 'price_asc'
    if mode=='price_desc': return sorted(rows,key=lambda p:(-eff_price(p),-ts(p)))
    if mode=='newest': return sorted(rows,key=lambda p:-ts(p))
    if mode=='manual': return sorted(rows,key=lambda p:(int(p.get('sort_order') or 0)<=0,int(p.get('sort_order') or 0),eff_price(p)))
    return sorted(rows,key=lambda p:(eff_price(p),-ts(p)))

# product cards / cart never need the long texts: leave them out of every list (product pages still get everything)
LIST_HIDE={'description':0,'description_bn':0,'specifications':0,'box_contents':0,'faq':0,'features_bn':0,'compare_note':0}
def catalog(f:dict,mode:str|None,n:int)->list:
    """Products in the chosen order, sorted and cut by MongoDB, so 10 or 10,000 products load equally fast."""
    mode=mode or (db.homepage.find_one({'key':'home'},{'product_sort':1}) or {}).get('product_sort') or 'price_asc'
    eff={'$cond':[{'$gt':[{'$ifNull':['$sale_price',0]},0]},'$sale_price',{'$ifNull':['$price',0]}]}
    order={'price_desc':{'_eff':-1,'created_at':-1},'newest':{'created_at':-1},
           'manual':{'_ml':1,'_so':1,'_eff':1}}.get(mode,{'_eff':1,'created_at':-1})
    try:
        return list(db.products.aggregate([{'$match':f},
            {'$addFields':{'_eff':eff,'_so':{'$ifNull':['$sort_order',0]},'_ml':{'$cond':[{'$gt':[{'$ifNull':['$sort_order',0]},0]},0,1]}}},
            {'$sort':{**order,'_id':1}},{'$limit':n},{'$project':{**LIST_HIDE,'_eff':0,'_so':0,'_ml':0}}]))
    except Exception:  # test double without aggregation support
        return sort_products(list(db.products.find(f,LIST_HIDE).limit(2000)),mode)[:n]

@app.get('/api/v1/home')
def home():
    mode=(db.homepage.find_one({'key':'home'},{'product_sort':1}) or {}).get('product_sort') or 'price_asc'
    pick=lambda f,n: serialize(with_names(catalog({'status':'active',**f},mode,n)))
    cs=serialize(db.settings.find_one({'key':'commerce'},{'_id':0})) or {}; cs['paystation_enabled']=bool(settings.paystation_enabled)
    return {'homepage':serialize(db.homepage.find_one({'key':'home'},{'_id':0})),'settings':cs,'categories':serialize(list(db.categories.find({'visible':True}).sort('order',1))),
            'featured':pick({'featured':True},8),'new_collection':pick({'new_collection':True},8),'products':pick({},12)}

@app.get('/api/v1/site-content')
def site_content():
    home=db.homepage.find_one({'key':'home'},{'_id':0}) or {}
    cfg=db.settings.find_one({'key':'commerce'},{'_id':0,'dealer_tiers':1,'bulk_threshold_qty':1,'digital_payment_discount_percent':1,'retail_max_qty_per_product':1}) or {}
    return {k:home.get(k,{}) for k in ('branding','links','trust','policies','dealer_benefits','announcement','footer','seo')}|{'dealer_tiers':cfg.get('dealer_tiers') or [5,8,12,15],'bulk_threshold_qty':cfg.get('bulk_threshold_qty',20),'digital_payment_discount_percent':cfg.get('digital_payment_discount_percent',2),'retail_max_qty_per_product':cfg.get('retail_max_qty_per_product',5)}

@app.get('/api/v1/categories')
def categories(): return serialize(list(db.categories.find({'visible':True}).sort('order',1)))
@app.get('/api/v1/brands')
def brands(category: str|None=None):
    q={'visible':True}
    if category:
        used=db.products.distinct('brand_slug',{'category_slug':category,'status':'active'})
        q['slug']={'$in':used}
    return serialize(list(db.brands.find(q).sort('order',1)))

SEARCH_FIELDS=('name','model','subtitle','sku','description','features','specifications')
def search_filter(q:str)->list:
    """Every word must match somewhere: product text, its category name or its brand name.
    'smart sun glass' finds products in “Smart Sun Glasses”; 'sunglass' also matches 'sun glass'."""
    words=[w for w in re.findall(r'[\w৳.-]+',q.lower()) if len(w)>=2][:8]
    cats=list(db.categories.find({},{'slug':1,'name':1})); brands=list(db.brands.find({},{'slug':1,'name':1}))
    squash=lambda s:re.sub(r'[^a-z0-9]','',(s or '').lower())
    out=[]
    for w in words:
        stem=w[:-2] if w.endswith('es') and len(w)>4 else w[:-1] if w.endswith('s') and len(w)>3 else w  # glasses → glass
        rx={'$regex':re.escape(stem),'$options':'i'}
        alts=[{k:rx} for k in SEARCH_FIELDS]
        cs=[c['slug'] for c in cats if stem in squash(c.get('name')) or stem in squash(c['slug'])]
        bs=[b['slug'] for b in brands if stem in squash(b.get('name')) or stem in squash(b['slug'])]
        if cs: alts.append({'category_slug':{'$in':cs}})
        if bs: alts.append({'brand_slug':{'$in':bs}})
        out.append({'$or':alts})
    # whole query squashed ('sunglass', 'g2pro') can also match a category / model written with spaces
    whole=squash(q)
    if len(words)>1 or not whole: return out
    cs=[c['slug'] for c in cats if whole in squash(c.get('name'))]
    if cs: out=[{'$or':out[0]['$or']+[{'category_slug':{'$in':cs}}]}] if out else [{'category_slug':{'$in':cs}}]
    return out

@app.get('/api/v1/products')
def products(category: str|None=None,brand: str|None=None,q: str|None=None,limit:int=50,camera: str|None=None,availability: str|None=None,min_price: float|None=None,max_price: float|None=None,sort: str='featured',ids: str|None=None,collection: str|None=None):
    f={'status':'active'}
    if ids:
        f['_id']={'$in':[ObjectId(x) for x in ids.split(',') if ObjectId.is_valid(x)][:100]}
    if category:f['category_slug']=category
    if brand:f['brand_slug']={'$in':[b for b in brand.split(',') if b]}
    if camera=='with':f['has_camera']=True
    elif camera=='without':f['has_camera']={'$ne':True}
    if availability=='in_stock':f['stock']={'$gt':0}
    elif availability=='out_of_stock':f['stock']={'$lte':0}
    if collection=='new':f['new_collection']=True
    elif collection=='featured':f['featured']=True
    elif collection=='offers':f['sale_price']={'$ne':None,'$gt':0}
    if min_price is not None or max_price is not None:
        rng={}
        if min_price is not None: rng['$gte']=min_price
        if max_price is not None: rng['$lte']=max_price
        f['$and']=[{'$or':[{'sale_price':rng},{'sale_price':None,'price':rng}]}]
    if q: f.setdefault('$and',[]).extend(search_filter(q))
    if sort in ('price_asc','price_desc','newest'):  # by selling price (sale price when set)
        return serialize(with_names(catalog(f,sort,min(limit,100))))
    order={'rating':[('rating',-1),('review_count',-1)],'popular':[('sold_count',-1)]}.get(sort)
    if order: return serialize(with_names(list(db.products.find(f,LIST_HIDE).sort(order).limit(min(limit,100)))))
    return serialize(with_names(catalog(f,None,min(limit,100))))  # default = Admin's Product order

def with_names(rows):
    """Adds category_name/brand_name to product lists so cards never show a raw slug."""
    cats={c['slug']:c.get('name') for c in db.categories.find({},{'slug':1,'name':1})}
    for p in rows: p['category_name']=cats.get(p.get('category_slug')) or (p.get('category_slug') or '').replace('-',' ').title()
    return rows

@app.get('/api/v1/products/{slug}')
def product(slug:str):
    p=db.products.find_one({'slug':slug,'status':'active'})
    if not p: raise HTTPException(404,'Product not found')
    b=db.brands.find_one({'slug':p.get('brand_slug')},{'name':1}); c=db.categories.find_one({'slug':p.get('category_slug')},{'name':1})
    p['brand_name']=(b or {}).get('name') or (p.get('brand_slug') or '').upper(); p['category_name']=(c or {}).get('name') or (p.get('category_slug') or '').replace('-',' ').title()
    return serialize(p)


# ---------- Customer accounts / first-party CRM analytics ----------
def optional_identity(authorization: str|None):
    if not authorization or not authorization.startswith('Bearer '): return None
    try: return decode_token(authorization.split(' ',1)[1])
    except Exception: return None

def dhaka_day_bounds(days_back:int=0):
    tz=ZoneInfo('Asia/Dhaka')
    local=datetime.now(tz)-timedelta(days=days_back)
    start=local.replace(hour=0,minute=0,second=0,microsecond=0)
    end=start+timedelta(days=1)
    return start.astimezone(timezone.utc),end.astimezone(timezone.utc)

@app.post('/api/v1/customers/register')
def customer_register(body: CustomerRegister):
    email=body.email.lower().strip(); phone=normalize_bd_phone(body.phone)
    if not consume_phone_verification(phone,'customer_register',body.otp_verification_id): raise HTTPException(400,'Phone OTP verification required')
    if db.customers.find_one({'phone':phone}): raise HTTPException(409,'This number is already registered. Please log in.')  # email may repeat
    doc=body.model_dump(exclude={'password'}); doc.update({'email':email,'phone':phone,'password_hash':hash_password(body.password),'account_type':'customer','lead_status':'New Lead','lead_priority':'Cold','total_orders':0,'total_purchase':0.0,'created_at':now(),'last_login_at':None,'last_active_at':now(),'assigned_sales_person':None,'sales_notes':[],'next_followup_at':None})
    r=db.customers.insert_one(doc)
    return {'access_token':create_token(str(r.inserted_id),'customer'),'customer':serialize({**doc,'_id':r.inserted_id,'password_hash':None})}

@app.post('/api/v1/customers/login')
def customer_login(body: Login):
    # email is not unique (one email, several numbers): use the account whose password matches
    c=next((x for x in db.customers.find({'email':body.email.lower().strip()}) if x.get('password_hash') and verify_password(body.password,x['password_hash'])),None)
    if not c: raise HTTPException(401,'Invalid login')
    db.customers.update_one({'_id':c['_id']},{'$set':{'last_login_at':now(),'last_active_at':now()}})
    clean={k:v for k,v in c.items() if k!='password_hash'}
    return {'access_token':create_token(str(c['_id']),'customer'),'customer':serialize(clean)}

class PhoneOTPLogin(BaseModel):
    phone: str
    verification_id: str
    name: str = ''

# ---------- remembered device: one OTP, then 30 days of logins without a code on that device (saves SMS) ----------
def _dev_hash(t:str)->str: return hmac.new(settings.app_secret.encode(),('device|'+t).encode(),hashlib.sha256).hexdigest()
def issue_device(customer_id:str,phone:str,request:Request|None=None)->dict:
    """Random token kept only in this browser; the DB keeps its hash. Expires 30 days after the OTP (not extended by use)."""
    t=secrets.token_urlsafe(32); exp=now()+timedelta(days=settings.customer_session_days)
    db.trusted_devices.insert_one({'token_hash':_dev_hash(t),'customer_id':customer_id,'phone':phone,'created_at':now(),'expires_at':exp,'last_used_at':now(),
        'ua':(request.headers.get('user-agent','')[:200] if request else '')})
    return {'device_token':t,'device_expires_at':exp.isoformat()}

class DeviceLogin(BaseModel):
    phone: str
    device_token: str

@app.post('/api/v1/customers/device-login')
def customer_device_login(body: DeviceLogin):
    """Login without OTP on a device that verified this number by OTP in the last 30 days."""
    phone=normalize_bd_phone(body.phone)
    d=db.trusted_devices.find_one({'token_hash':_dev_hash(body.device_token[:200]),'phone':phone})
    if not d or d['expires_at'].replace(tzinfo=d['expires_at'].tzinfo or timezone.utc)<now(): raise HTTPException(401,'Please verify with an OTP again')
    c=db.customers.find_one({'_id':ObjectId(d['customer_id'])}) if ObjectId.is_valid(d.get('customer_id','')) else None
    if not c or c.get('phone')!=phone: db.trusted_devices.delete_one({'_id':d['_id']}); raise HTTPException(401,'Please verify with an OTP again')
    db.trusted_devices.update_one({'_id':d['_id']},{'$set':{'last_used_at':now()}})
    db.customers.update_one({'_id':c['_id']},{'$set':{'last_login_at':now(),'last_active_at':now()}})
    return {'access_token':create_token(str(c['_id']),'customer'),'device_expires_at':d['expires_at'].isoformat()}

@app.post('/api/v1/customers/phone-login')
def customer_phone_login(body: PhoneOTPLogin, request: Request):
    """Passwordless customer login; requires a consumed, verified OTP."""
    phone=normalize_bd_phone(body.phone)
    c=db.customers.find_one({'phone':phone})
    if not c: raise HTTPException(404,'No account found for this number. Please register first.')
    if not consume_phone_verification(phone,'login',body.verification_id):
        raise HTTPException(401,'Valid phone OTP verification required')
    db.customers.update_one({'_id':c['_id']},{'$set':{'last_login_at':now(),'last_active_at':now()}})
    return {'access_token':create_token(str(c['_id']),'customer'),**issue_device(str(c['_id']),phone,request),
            'customer':serialize({k:v for k,v in c.items() if k!='password_hash'})}

@app.post('/api/v1/customers/register-phone')
def customer_register_phone(body: PhoneRegister, request: Request):
    """Mobile-number-only registration, verified by OTP (purpose=customer_register)."""
    phone=normalize_bd_phone(body.phone)
    if db.customers.find_one({'phone':phone}): raise HTTPException(409,'This number is already registered. Please log in.')
    email=body.email.lower().strip() if body.email else None
    if not consume_phone_verification(phone,'customer_register',body.verification_id): raise HTTPException(401,'Valid phone OTP verification required')
    doc={'name':body.name.strip(),'phone':phone,'phone_verified':True,'district':body.district,'address':body.address,'account_type':'customer','lead_status':'New Lead','lead_priority':'Cold','total_orders':0,'total_purchase':0.0,'created_at':now(),'last_login_at':now(),'last_active_at':now(),'assigned_sales_person':None,'sales_notes':[],'next_followup_at':None}
    if email: doc['email']=email
    r=db.customers.insert_one(doc)
    return {'access_token':create_token(str(r.inserted_id),'customer'),**issue_device(str(r.inserted_id),phone,request),'customer':serialize({**doc,'_id':r.inserted_id})}

@app.put('/api/v1/customers/me')
def customer_update_me(payload: dict, authorization: str|None=Header(None)):
    auth=require_role(authorization,('customer',))
    upd={k:str(v).strip()[:300] for k,v in payload.items() if k in ('name','address','district') and v is not None}
    if payload.get('email'):
        email=str(payload['email']).lower().strip()
        if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+',email): raise HTTPException(400,'Invalid email')
        upd['email']=email
    if upd: db.customers.update_one({'_id':ObjectId(auth['sub'])},{'$set':upd})
    return {'ok':True}

MONEY_SENT=('Paid','Advance Paid','COD Collected','Awaiting Verification','Awaiting Advance Verification','Payment Rejected')
def can_self_cancel(o)->bool:
    """Only Cash on Delivery orders, until EMXIN confirms. Paid / bKash / Nagad orders go through EMXIN (they refund the money)."""
    return o.get('order_status')=='Pending Confirmation' and not o.get('courier') and o.get('payment_method')=='cod' and o.get('payment_status') not in MONEY_SENT

def cancel_view(o:dict)->dict:
    """Who cancelled and why, for the customer. Older cancels had no fields: they were done by EMXIN, the reason was the admin note."""
    if o.get('order_status')!='Cancelled': return o
    if not o.get('cancelled_by'):
        o['cancelled_by']='emxin'
        note=next((t.get('note') for t in reversed(o.get('timeline') or []) if t.get('order_status')=='Cancelled'),'') or ''
        o['cancel_reason']='' if note.lower().startswith('cancelled by') else note
    if not o.get('cancelled_at'): o['cancelled_at']=o.get('updated_at')
    return o

def binned_orders(q:dict,limit:int=50)->list:
    """Orders EMXIN deleted (Recycle Bin): the customer still sees them, as cancelled by EMXIN."""
    out=[]
    for b in db.recycle_bin.find({'kind':'order',**{'doc.'+k:v for k,v in q.items()}},{'doc':1,'deleted_at':1}).sort('deleted_at',-1).limit(limit):
        o=b.get('doc') or {}
        o.update({'order_status':'Cancelled','cancelled_by':o.get('cancelled_by') or 'emxin','cancel_reason':o.get('cancel_reason') or '','cancelled_at':o.get('cancelled_at') or b.get('deleted_at'),'removed':True})
        out.append(o)
    return out

@app.post('/api/v1/orders/{order_id}/cancel')
def customer_cancel(order_id:str,payload:dict|None=Body(None),authorization: str|None=Header(None)):
    auth=require_role(authorization,('customer',))
    o=db.orders.find_one({'order_id':order_id,'customer_id':auth['sub']})
    if not o: raise HTTPException(404,'Order not found')
    if o.get('order_status')=='Cancelled': return {'ok':True,'already':True}
    if not can_self_cancel(o):
        if o.get('order_status')!='Pending Confirmation': raise HTTPException(409,'EMXIN has already confirmed this order. Please message or call EMXIN to cancel it.')
        raise HTTPException(409,'This order is paid by bKash / Nagad / online payment. Please message or call EMXIN to cancel it and get your money back.')
    reason=str((payload or {}).get('reason') or '').strip()[:300]
    done=db.orders.find_one_and_update({'_id':o['_id'],'order_status':'Pending Confirmation'},
        {'$set':{'order_status':'Cancelled','cancelled_by':'customer','cancel_reason':reason,'cancelled_at':now(),'updated_at':now()},
         '$push':{'timeline':{'at':now(),'order_status':'Cancelled','note':'Cancelled by the customer'+(f': {reason}' if reason else ''),'role':'customer'}}})
    if not done: raise HTTPException(409,'EMXIN has just confirmed this order. Please message or call EMXIN to cancel it.')
    release_stock(done)  # no SMS: the customer did it themselves (saves SMS cost)
    return {'ok':True}

@app.get('/api/v1/customers/me')
def customer_me(lite: bool=False,authorization: str|None=Header(None)):
    auth=require_role(authorization,('customer',)); c=db.customers.find_one({'_id':ObjectId(auth['sub'])},{'password_hash':0})
    if not c: raise HTTPException(404,'Customer not found')
    if lite:  # header account menu: name, phone and dealer status only (no orders)
        d=db.dealers.find_one({'phone':c.get('phone')},{'status':1,'dealer_code':1,'shop_name':1}) if c.get('phone') else None
        return {'name':c.get('name') or '','phone':c.get('phone') or '','email':c.get('email') or '','verified':c.get('phone_verified')!=False,
                'dealer':{'status':d.get('status'),'code':d.get('dealer_code'),'shop':d.get('shop_name')} if d else None}
    orders=list(db.orders.find({'customer_id':str(c['_id'])}).sort('created_at',-1).limit(200))+binned_orders({'customer_id':str(c['_id'])})
    orders.sort(key=lambda o:o.get('created_at') or now(),reverse=True)
    for o in orders: cancel_view(o); o['can_cancel']=False if o.get('removed') else can_self_cancel(o)
    return {'customer':serialize(c),'orders':serialize(orders)}

@app.post('/api/v1/analytics/events')
def analytics_event(body: AnalyticsEvent,authorization: str|None=Header(None)):
    ident=optional_identity(authorization); customer_id=None
    if ident and ident.get('role')=='customer': customer_id=ident.get('sub')
    doc=body.model_dump(); doc.update({'customer_id':customer_id,'created_at':now()})
    db.analytics_events.insert_one(doc)
    if customer_id:
        updates={'last_active_at':now()}
        if body.event_type in ('product_view','wishlist','add_to_cart','checkout_started','quantity_request','dealer_interest'):
            priority={'product_view':'Cold','wishlist':'Warm','add_to_cart':'Warm','checkout_started':'Hot','quantity_request':'Hot','dealer_interest':'Hot'}[body.event_type]
            updates['lead_priority']=priority
            if body.event_type in ('checkout_started','quantity_request','dealer_interest'): updates['lead_status']='Interested'
        db.customers.update_one({'_id':ObjectId(customer_id)},{'$set':updates})
    return {'ok':True}

# ---------- Quantity / dealer leads ----------
@app.post('/api/v1/quantity-requests')
def quantity_request(body: QuantityRequest):
    if not ObjectId.is_valid(body.product_id): raise HTTPException(400,'Invalid product id')
    p=db.products.find_one({'_id':ObjectId(body.product_id)})
    if not p: raise HTTPException(404,'Product not found')
    colors=set(p.get('colors') or ['Black'])
    if any(k not in colors or v<0 for k,v in body.color_quantities.items()): raise HTTPException(400,'Invalid colour quantities')
    color_total=sum(body.color_quantities.values()); total=max(body.total_quantity,color_total)
    if total<1: raise HTTPException(400,'Required quantity must be at least 1')
    doc=body.model_dump(); doc.update({'phone':normalize_bd_phone(body.phone),'total_quantity':total,'product_name':p['name'],'status':'New','created_at':now()})
    result=db.quantity_requests.insert_one(doc)
    if body.dealer_opt_in:
        db.dealer_leads.update_one({'phone':body.phone},{'$set':{'name':body.name,'shop_name':body.shop_name,'phone':body.phone,'email':body.email,'status':'Pending','source':'quantity_request','updated_at':now()}},upsert=True)
    return {'request_id':str(result.inserted_id),'status':'New'}

@app.post('/api/v1/dealers/apply')
def dealer_apply(body: DealerApply):
    phone=normalize_bd_phone(body.phone)
    if why:=dealer_block(phone,body.preferred_language): raise HTTPException(409,why)
    if not body.terms_accepted: raise HTTPException(400,'Please read and accept the dealer order terms')
    if not consume_phone_verification(body.phone,'dealer_register',body.otp_verification_id): raise HTTPException(400,'Phone OTP verification required')
    doc=body.model_dump(exclude={'password'}); doc['phone']=phone; doc['terms_accepted_at']=now(); doc.update({'password_hash':hash_password(body.password),'status':'Pending','updated_at':now(),'business_type':shop_type(body.business_type)})
    old=db.dealers.find_one({'phone':phone})
    if old:  # rejected before: the same record becomes a fresh application (keeps dealer ID, orders and history)
        n=int(old.get('applications') or 1)+1
        doc.update({'applications':n,'reapplied_at':now(),'status_note':''})
        db.dealers.update_one({'_id':old['_id']},{'$set':doc,'$push':{'status_history':{'at':now(),'status':'Pending','note':f'Applied again (application #{n})'}}})
        dealer_id=str(old['_id'])
    else:
        n=1; doc.update({'applications':1,'discount_percent':settings.bulk_discount_percent,'created_at':now(),'total_orders':0,'total_purchase':0})
        dealer_id=str(db.dealers.insert_one(doc).inserted_id)
    link_dealer(db.dealers.find_one({'_id':ObjectId(dealer_id)}))  # one person = one account: they can log in on the website with this number
    queue_sms(f'dealer-applied-{dealer_id}'+(f'-{n}' if n>1 else ''),phone,t_dealer_applied(),'dealer')
    return {'dealer_id':dealer_id,'status':'Pending','reapplied':n>1,'sms_queued':True}

@app.post('/api/v1/dealers/login')
def dealer_login(body: Login):
    d=next((x for x in db.dealers.find({'email':body.email.lower().strip()}) if x.get('password_hash') and verify_password(body.password,x['password_hash'])),None)
    if not d: raise HTTPException(401,'Invalid login')
    return {'access_token':create_token(str(d['_id']),'dealer'),'dealer':serialize({k:v for k,v in d.items() if k!='password_hash'})}

@app.get('/api/v1/dealer/dashboard')
def dealer_dashboard(authorization: str|None=Header(None)):
    auth=require_role(authorization,('dealer',)); d=db.dealers.find_one({'_id':ObjectId(auth['sub'])})
    orders=list(db.orders.find({'$or':[{'dealer_id':str(d['_id'])},{'phone':d['phone']}]}).sort('created_at',-1).limit(100)) if d.get('status')=='Active' else []
    return {'dealer':serialize({k:v for k,v in d.items() if k!='password_hash'}),'orders':serialize(orders)}

# ---------- Orders / checkout ----------
def commerce_settings(): return db.settings.find_one({'key':'commerce'},{'_id':0}) or {}

def valid_coupon(code):
    if not code:return None
    c=db.coupons.find_one({'code':code.upper(),'active':True})
    if not c:return None
    n=now();
    if c.get('starts_at') and n<c['starts_at']: return None
    if c.get('ends_at') and n>c['ends_at']: return None
    return c

def order_pricing_cfg(phone,dealer_opt_in,qty):
    """Settings used to price an order (dealer tier discount only for approved, active dealers)."""
    dealer=db.dealers.find_one({'phone':normalize_bd_phone(phone),'status':'Active'}) if dealer_opt_in and phone else None
    cfg=commerce_settings().copy()
    if dealer and qty>=20:
        completed=db.orders.count_documents({'dealer_id':str(dealer['_id']),'order_status':{'$in':['Delivered','Completed']}})
        tiers=cfg.get('dealer_tiers') or [5,8,12,15]
        tier=tiers[min(completed,len(tiers)-1)]
        cfg['bulk_discount_percent']=float(dealer.get('discount_override_percent') if dealer.get('discount_override_percent') is not None else tier) if dealer.get('discount_approved',False) else 0.0
    else:
        cfg['bulk_discount_percent']=0.0
    cfg['category_dealer']={c['slug']:(c.get('dealer_mode') or 'tiers',c.get('dealer_percent')) for c in db.categories.find({},{'slug':1,'dealer_mode':1,'dealer_percent':1})}
    return dealer,cfg

@app.post('/api/v1/orders/quote')
def order_quote(body: OrderQuote, authorization: str|None=Header(None)):
    """Exact server price for the checkout page (so a Send Money customer sends the right amount)."""
    phone=None
    if authorization:
        try:
            ident=decode_token(authorization.split(' ',1)[-1]); c=db.customers.find_one({'_id':ObjectId(ident['sub'])},{'phone':1}); phone=(c or {}).get('phone')
        except Exception: phone=None
    ids=[ObjectId(i.product_id) for i in body.items if ObjectId.is_valid(i.product_id)]
    pmap={str(p['_id']):p for p in db.products.find({'_id':{'$in':ids},'status':'active'})}
    items=[i.model_dump() for i in body.items if i.product_id in pmap]
    if not items: raise HTTPException(400,'No available products')
    coupon=valid_coupon(body.coupon_code)
    if coupon and phone and coupon_used_up_by(coupon,phone): coupon=None
    _,cfg=order_pricing_cfg(phone,body.dealer_opt_in,sum(i['quantity'] for i in items))
    return calculate(items,pmap,body.district,body.payment_method,coupon,cfg)

def coupon_used_up_by(coupon:dict,phone:str|None=None,customer_id:str|None=None)->bool:
    """True when this customer (same account or same mobile number) already used the coupon its allowed number of times."""
    limit=coupon.get('per_customer_limit',1)
    if not limit: return False
    who=[q for q in ([{'customer_id':customer_id}] if customer_id else [])+([{'phone':normalize_bd_phone(phone)}] if phone else [])]
    if not who: return False
    return db.orders.count_documents({'coupon_code':coupon['code'],'order_status':{'$nin':['Cancelled','Returned']},'$or':who})>=int(limit)

def retail_qty_problem(items:list,cfg:dict)->str:
    """Retail (not bulk) orders: at most N pieces of each product. Bulk (20+ pcs) / dealer orders have no per-product cap."""
    cap=int(cfg.get('retail_max_qty_per_product') or 5); bulk=int(cfg.get('bulk_threshold_qty',settings.bulk_threshold_qty))
    per={}
    for i in items: per[i['product_id']]=per.get(i['product_id'],0)+int(i['quantity'])
    if sum(per.values())>=bulk: return ''
    over=[pid for pid,q in per.items() if q>cap]
    have=sum(per.values())
    return f'Retail orders: up to {cap} pcs of each product. Dealer / bulk orders: {bulk}+ pcs in total. You have {have} pcs, so add {bulk-have} more pcs or reduce to {cap}.' if over else ''

# ---------- Manual bKash / Nagad "Send Money" payments ----------
CHANNEL_LABEL={'bkash':'bKash','nagad':'Nagad'}
def clean_trx(t:str|None)->str:
    t=re.sub(r'[^A-Za-z0-9]','',t or '').upper()
    if not re.fullmatch(r'[A-Z0-9]{6,20}',t): raise HTTPException(400,'Enter the Transaction ID (TrxID) exactly as shown in your bKash/Nagad message')
    return t
def trx_used(trx:str,exclude_order:str|None=None)->bool:
    q={'manual_payment.trx_id':trx,'manual_payment.status':{'$ne':'rejected'}}
    if exclude_order: q['order_id']={'$ne':exclude_order}
    return bool(db.orders.find_one(q,{'_id':1})) or bool(db.payment_transactions.find_one({'trx_id':trx},{'_id':1}))
def manual_payment_doc(channel,trx,sender,pricing,order_id=None)->dict:
    acc=(commerce_settings().get('payment_accounts') or {}).get(channel or '') or {}
    if not channel or not acc.get('enabled') or not acc.get('number'): raise HTTPException(400,'Choose bKash or Nagad — that payment number is not available right now')
    trx=clean_trx(trx)
    if trx_used(trx,order_id): raise HTTPException(409,'This Transaction ID was already used for another order')
    try: sender_n=normalize_bd_phone(sender or '')
    except HTTPException: raise HTTPException(400,'Enter the mobile number you sent the money from (01XXXXXXXXX)')
    expected=float(pricing['advance_required'] if pricing.get('is_bulk') else pricing['grand_total'])
    return {'channel':channel,'channel_label':CHANNEL_LABEL[channel],'to_number':acc.get('number'),'to_account_type':acc.get('account_type','personal'),'trx_id':trx,'sender':sender_n,
            'amount_expected':expected,'is_advance':bool(pricing.get('is_bulk')),'status':'pending','submitted_at':now()}

@app.post('/api/v1/orders/{order_id}/manual-payment')
def resubmit_manual_payment(order_id:str,body:ManualPaymentSubmit,authorization: str|None=Header(None)):
    """Customer re-sends the TrxID (e.g. after EMXIN rejected a wrong one)."""
    identity=require_role(authorization,('customer',))
    o=db.orders.find_one({'order_id':order_id,'customer_id':identity['sub']})
    if not o: raise HTTPException(404,'Order not found')
    if o.get('order_status') in ('Cancelled','Returned','Delivered','Completed'): raise HTTPException(409,'This order is closed')
    if (o.get('manual_payment') or {}).get('status')=='verified': raise HTTPException(409,'Payment is already verified')
    if o.get('payment_method')!='manual': raise HTTPException(409,'Send Money can be chosen at checkout. Contact EMXIN to change the payment method.')
    pricing=o['pricing']; mp=manual_payment_doc(body.channel,body.trx_id,body.sender_number,pricing,order_id)
    st='Awaiting Advance Verification' if pricing.get('is_bulk') else 'Awaiting Verification'
    db.orders.update_one({'_id':o['_id']},{'$set':{'manual_payment':mp,'payment_channel':mp['channel'],'payment_status':st,'updated_at':now()},
        '$push':{'timeline':{'at':now(),'payment_status':st,'note':f"Customer re-sent {mp['channel_label']} TrxID {mp['trx_id']}",'role':'customer'}}})
    return {'ok':True,'payment_status':st}

@app.post('/api/v1/admin/orders/{order_id}/manual-payment')
async def review_manual_payment(order_id:str,body:ManualPaymentReview,authorization: str|None=Header(None)):
    """Admin checks the TrxID in the bKash/Nagad app, then Verify (optionally confirms the order → Steadfast) or Reject."""
    actor=require_role(authorization,ORDER_WRITE)
    o=db.orders.find_one({'order_id':order_id})
    if not o or not o.get('manual_payment'): raise HTTPException(404,'No Send Money payment on this order')
    mp=o['manual_payment']
    if body.action=='reject':
        st='Payment Rejected'
        db.orders.update_one({'_id':o['_id']},{'$set':{'manual_payment.status':'rejected','manual_payment.note':body.note,'manual_payment.reviewed_at':now(),'manual_payment.reviewed_by':actor['sub'],'payment_status':st,'updated_at':now()},
            '$push':{'timeline':{'at':now(),'payment_status':st,'note':'Payment not found / wrong: '+(body.note or 'please re-send the TrxID'),'role':'admin'}}})
        queue_sms(f"payment-rejected-{order_id}-{mp.get('trx_id')}",o['phone'],t_payment_rejected(o),'order',order_id=order_id)
        return serialize(db.orders.find_one({'_id':o['_id']}))
    if mp.get('status')!='verified':
        amount=float(body.amount_received if body.amount_received is not None else mp.get('amount_expected',0))
        st='Advance Paid' if mp.get('is_advance') else 'Paid'
        db.orders.update_one({'_id':o['_id']},{'$set':{'manual_payment.status':'verified','manual_payment.amount_received':amount,'manual_payment.note':body.note,'manual_payment.reviewed_at':now(),'manual_payment.reviewed_by':actor['sub'],
            'payment_status':st,'paid_at':now(),'updated_at':now()},'$push':{'timeline':{'at':now(),'payment_status':st,'note':f"{mp.get('channel_label')} TrxID {mp.get('trx_id')} verified · ৳{amount:,.0f}",'role':'admin'}}})
        db.ledger.insert_one({'order_id':order_id,'type':'payment_received','amount':amount,'payment_method':mp.get('channel'),'trx_id':mp.get('trx_id'),'source':'manual_send_money','created_at':now()})
        db.payment_transactions.update_one({'trx_id':mp.get('trx_id')},{'$setOnInsert':{'trx_id':mp.get('trx_id'),'order_id':order_id,'amount':amount,'method':mp.get('channel'),'source':'manual_send_money','created_at':now()}},upsert=True)
    if body.confirm and o.get('order_status')=='Pending Confirmation':
        return await confirm_order(order_id,authorization)
    return serialize(db.orders.find_one({'_id':o['_id']}))

def manual_unverified(o)->bool:
    return o.get('payment_method')=='manual' and (o.get('manual_payment') or {}).get('status')!='verified'

@app.post('/api/v1/orders')
async def create_order(body: OrderCreate, authorization: str|None=Header(None)):
    identity=require_role(authorization,('customer',))
    buyer=db.customers.find_one({'_id':ObjectId(identity['sub'])})
    if not buyer or normalize_bd_phone(body.phone)!=normalize_bd_phone(buyer.get('phone','')):
        raise HTTPException(403,'Checkout phone must match your verified account')
    ids=[]
    for i in body.items:
        try: ids.append(ObjectId(i.product_id))
        except: raise HTTPException(400,'Invalid product id')
    plist=list(db.products.find({'_id':{'$in':ids},'status':'active'}))
    pmap={str(p['_id']):p for p in plist}
    if len(pmap)!=len(set(x.product_id for x in body.items)): raise HTTPException(400,'One or more products unavailable')
    for i in body.items:
        if pmap[i.product_id].get('stock',0)<i.quantity: raise HTTPException(409,f"Insufficient stock for {pmap[i.product_id]['name']}")
    coupon=valid_coupon(body.coupon_code)
    if body.coupon_code and not coupon: raise HTTPException(400,'Coupon is invalid or expired')
    if coupon and coupon.get('usage_limit') and db.orders.count_documents({'coupon_code':coupon['code'],'order_status':{'$nin':['Cancelled','Returned']}})>=coupon['usage_limit']: raise HTTPException(409,'Coupon usage limit reached')
    if coupon and coupon_used_up_by(coupon,body.phone,str(buyer['_id'])): raise HTTPException(409,f"You have already used coupon {coupon['code']}. Each customer can use it once.")
    if (why:=retail_qty_problem([x.model_dump() for x in body.items],commerce_settings())): raise HTTPException(400,why)
    if coupon and coupon.get('min_order') and sum(float(pmap[i.product_id].get('sale_price') or pmap[i.product_id]['price'])*i.quantity for i in body.items)<float(coupon['min_order']): raise HTTPException(400,f"Minimum order ৳{coupon['min_order']} required for this coupon")
    dealer,cfg=order_pricing_cfg(body.phone,body.dealer_opt_in,sum(i.quantity for i in body.items))
    pricing=calculate([x.model_dump() for x in body.items],pmap,body.district,body.payment_method,coupon,cfg)
    pricing['dealer_discount_requires_approval']=bool(dealer and not dealer.get('discount_approved',False))
    if (pricing['is_bulk'] or body.dealer_opt_in) and not body.shop_name:
        raise HTTPException(400,'Shop / Business Name is required for bulk/dealer orders')
    order_id='EMX-'+now().strftime('%y%m%d')+'-'+secrets.token_hex(3).upper()
    if body.dealer_opt_in and body.shop_name:
        if not dealer:
            db.dealer_leads.update_one({'phone':body.phone},{'$set':{'name':body.customer_name,'shop_name':body.shop_name,'phone':body.phone,'email':body.email,'status':'Pending','source':'checkout','updated_at':now()}},upsert=True)
    status='Pending Confirmation'
    if pricing['is_bulk']:
        if body.payment_method not in ('paystation','manual'): raise HTTPException(400,f"Bulk orders ({int(cfg.get('bulk_threshold_qty',settings.bulk_threshold_qty))}+ pcs) need a {int(cfg.get('bulk_advance_percent',50))}% advance payment (bKash / Nagad)")
        payment_status='Awaiting Advance Verification' if body.payment_method=='manual' else 'Pending Advance Payment'
    else:
        payment_status='Unpaid' if body.payment_method in ('cod','bank') else 'Awaiting Verification' if body.payment_method=='manual' else 'Pending Payment'
    manual=manual_payment_doc(body.manual_channel,body.trx_id,body.sender_number,pricing) if body.payment_method=='manual' else None
    items=[]
    for i in body.items:
        p=pmap[i.product_id]
        items.append({'product_id':i.product_id,'name':p['name'],'slug':p['slug'],'quantity':i.quantity,'frame_color':i.frame_color,'unit_price':float(p.get('sale_price') or p['price'])})
    customer=buyer
    doc={'order_id':order_id,'customer_name':body.customer_name,'phone':normalize_bd_phone(body.phone),'timeline':[{'at':now(),'order_status':status,'payment_status':payment_status,'note':'Order placed on website','role':'customer'}],'email':body.email,'customer_id':str(customer['_id']) if customer else None,'address':body.address,'district':body.district,'items':items,'pricing':pricing,'payment_method':body.payment_method,'payment_status':payment_status,'order_status':status,'coupon_code':coupon.get('code') if coupon else None,'dealer_opt_in':body.dealer_opt_in,'shop_name':body.shop_name,'dealer_id':str(dealer['_id']) if dealer else None,'customer_type':'dealer' if dealer else 'retail','dealer_discount_approved':bool(dealer and dealer.get('discount_approved')), 'courier':None,'courier_data':None,'courier_billing_mode':('deduct_from_cod_collection' if pricing.get('cod_due',0)>0 else 'merchant_periodic_bill'),'created_at':now(),'updated_at':now()}
    if manual: doc['manual_payment']=manual; doc['payment_channel']=manual['channel']; doc['timeline'][0]['note']=f"Order placed · {manual['channel_label']} Send Money TrxID {manual['trx_id']} (to verify)"
    # Reserve stock immediately for confirmed website intent; cancelled orders can release via admin action.
    for i in body.items: db.products.update_one({'_id':ObjectId(i.product_id)},{'$inc':{'stock':-i.quantity,'reserved':i.quantity}})
    db.orders.insert_one(doc)
    if customer:
        db.customers.update_one({'_id':customer['_id']},{'$inc':{'total_orders':1,'total_purchase':pricing['grand_total']},'$set':{'lead_status':'Converted','lead_priority':'Hot','last_active_at':now()}})
    db.customers.update_one({'_id':buyer['_id'],'address':{'$in':[None,'']}},{'$set':{'address':body.address,'district':body.district}})
    db.ledger.insert_one({'order_id':order_id,'type':'order_created','amount':pricing['grand_total'],'payment_method':body.payment_method,'created_at':now()})
    response={'order_id':order_id,'status':status,'payment_status':payment_status,'pricing':pricing,'manual_payment':manual}
    if body.payment_method=='paystation':
        response['paystation']=await start_paystation(doc)
    return response

def paystation_amount(o):
    p=o.get('pricing') or {}
    return int(round(p['advance_required'] if p.get('is_bulk') else p['grand_total']))

async def start_paystation(o):
    """Create a PayStation checkout. Each attempt needs a unique invoice number (PayStation rejects duplicates)."""
    attempts=o.get('paystation_invoices') or []
    invoice=o['order_id'] if not attempts else f"{o['order_id']}-{len(attempts)+1}"
    amount=paystation_amount(o)
    try:
        pay=await PayStationClient().initiate(o,amount,invoice)
    except IntegrationNotConfigured as e:
        return {'configured':False,'message':'Online payment is not available right now. Our team will call you with payment options.'}
    except Exception:
        return {'configured':True,'payment_url':None,'message':'Could not reach the payment gateway. Please try again from your account.'}
    ok=str(pay.get('status_code'))=='200' and pay.get('payment_url')
    db.orders.update_one({'order_id':o['order_id']},{'$push':{'paystation_invoices':invoice},'$set':{'paystation_create_response':pay,'paystation_expected_amount':amount,'updated_at':now()}})
    return {'configured':True,'payment_url':pay.get('payment_url') if ok else None,'invoice_number':invoice,'amount':amount,'message':pay.get('message')}

PAID_STATES=('Paid','COD Collected','Advance Paid')
async def verify_paystation(o):
    """Server-to-server check with PayStation; never trusts browser/callback parameters."""
    if o.get('payment_status') in PAID_STATES: return {'paid':True,'payment_status':o['payment_status'],'already':True}
    expected=int(o.get('paystation_expected_amount') or paystation_amount(o))
    last=None
    for invoice in reversed(o.get('paystation_invoices') or [o['order_id']]):
        try: res=await PayStationClient().status(invoice)
        except IntegrationNotConfigured as e: raise HTTPException(503,str(e))
        except Exception: continue
        data=res.get('data') or {}
        last=str(data.get('trx_status','')).lower()
        try: paid_amount=float(data.get('payment_amount') or data.get('trx_amount') or 0)
        except Exception: paid_amount=0
        if str(res.get('status_code'))=='200' and last in ('success','successful') and paid_amount+0.5>=expected:
            is_bulk=(o.get('pricing') or {}).get('is_bulk')
            new_status='Advance Paid' if is_bulk else 'Paid'
            channel=str(data.get('payment_method','')).lower().replace(' ','')
            channel=channel if channel in ('bkash','nagad','rocket','upay') else ('card' if channel in ('visa','mastercard','amex','americanexpress') else 'paystation')
            r=db.orders.update_one({'_id':o['_id'],'payment_status':{'$nin':list(PAID_STATES)}},{'$set':{'payment_status':new_status,'payment_channel':channel,'paystation_trx_id':data.get('trx_id'),'paid_at':now(),'updated_at':now()},'$push':{'timeline':{'at':now(),'payment_status':new_status,'note':f"PayStation {data.get('payment_method','')} {data.get('trx_id','')} verified",'role':'system'}}})
            if r.modified_count:
                db.ledger.insert_one({'order_id':o['order_id'],'type':'payment_received','amount':paid_amount,'payment_method':channel,'trx_id':data.get('trx_id'),'invoice_number':invoice,'note':'PayStation verified','created_at':now()})
                db.payment_transactions.update_one({'trx_id':data.get('trx_id') or invoice},{'$setOnInsert':{'trx_id':data.get('trx_id') or invoice,'order_id':o['order_id'],'invoice_number':invoice,'amount':paid_amount,'method':data.get('payment_method'),'status':'success','payer':data.get('payer_mobile_no'),'created_at':now()}},upsert=True)
            return {'paid':True,'payment_status':new_status,'trx_id':data.get('trx_id'),'method':data.get('payment_method')}
    if last in ('failed','refund') and o.get('payment_status') in ('Pending Payment','Pending Advance Payment'):
        db.orders.update_one({'_id':o['_id']},{'$push':{'timeline':{'at':now(),'note':f'PayStation attempt {last}','role':'system'}}})
    return {'paid':False,'trx_status':last or 'not_found','payment_status':o.get('payment_status')}

def order_from_invoice(invoice:str):
    invoice=str(invoice or '')[:128]
    return db.orders.find_one({'$or':[{'order_id':invoice},{'paystation_invoices':invoice}]})

@app.post('/api/v1/payments/paystation/verify')
async def paystation_verify(payload: dict):
    """Called by the /payment-result page. Looks the order up by invoice, then asks PayStation directly."""
    o=order_from_invoice(payload.get('invoice_number'))
    if not o: raise HTTPException(404,'Order not found')
    result=await verify_paystation(o)
    p=o.get('pricing') or {}
    return {**result,'order_id':o['order_id'],'grand_total':p.get('grand_total'),'amount':paystation_amount(o),'is_bulk':p.get('is_bulk'),'cod_due':p.get('cod_due')}

@app.post('/api/v1/orders/{order_id}/pay')
async def retry_payment(order_id:str, authorization: str|None=Header(None)):
    ident=require_role(authorization,('customer',))
    o=db.orders.find_one({'order_id':order_id,'customer_id':ident['sub']})
    if not o: raise HTTPException(404,'Order not found')
    if o.get('order_status') in ('Cancelled','Returned'): raise HTTPException(409,'This order was cancelled')
    if o.get('payment_status') in PAID_STATES: raise HTTPException(409,'This order is already paid')
    if not settings.paystation_enabled:  # nothing is changed on the order; the page offers bKash / Nagad Send Money instead
        return {'configured':False,'send_money':True,'message':'Online card payment is not available right now. Pay by bKash / Nagad Send Money instead.'}
    if o.get('payment_method')!='paystation':
        if o.get('order_status')!='Pending Confirmation': raise HTTPException(409,'This order is already confirmed. Please pay on delivery.')
        pricing=reprice_order(o,'paystation')
        db.orders.update_one({'_id':o['_id']},{'$set':{'payment_method':'paystation','switched_from':o.get('payment_method'),'pricing':pricing,'courier_billing_mode':'merchant_periodic_bill' if not pricing.get('cod_due') else 'deduct_from_cod_collection','payment_status':'Pending Advance Payment' if pricing['is_bulk'] else 'Pending Payment','updated_at':now()},'$push':{'timeline':{'at':now(),'note':'Customer switched from Cash on Delivery to online payment','role':'customer'}}})
        o=db.orders.find_one({'_id':o['_id']})
    return await start_paystation(o)

def paystation_orders_to_cod():
    """EMXIN takes bKash / Nagad Send Money and COD only. Unpaid PayStation orders (from the old "Pay online" button) become COD again."""
    if settings.paystation_enabled: return
    for o in db.orders.find({'payment_method':'paystation','payment_status':{'$nin':list(PAID_STATES)},'order_status':'Pending Confirmation'}):
        try:
            pricing=reprice_order(o,'cod')
            if pricing.get('is_bulk'): continue  # bulk needs an advance: leave for Admin
            old=float((o.get('pricing') or {}).get('grand_total') or 0)
            r=db.orders.update_one({'_id':o['_id'],'payment_method':'paystation','order_status':'Pending Confirmation'},{'$set':{'payment_method':'cod','pricing':pricing,'payment_status':'Unpaid','payment_channel':'cod','courier_billing_mode':'deduct_from_cod_collection','updated_at':now()},
                '$push':{'timeline':{'at':now(),'payment_status':'Unpaid','note':'Online payment is not used: order set back to Cash on Delivery','role':'system'}}})
            if r.modified_count and o.get('customer_id'): db.customers.update_one({'_id':ObjectId(o['customer_id'])},{'$inc':{'total_purchase':float(pricing['grand_total'])-old}})
        except Exception as e: log.warning('paystation→cod %s: %s',o.get('order_id'),e)

def reprice_order(o:dict,method:str)->dict:
    """Same items, coupon and dealer pricing as when the order was placed, with a different payment method."""
    items=[{'product_id':i['product_id'],'quantity':i['quantity']} for i in o['items']]
    pmap={str(p['_id']):p for p in db.products.find({'_id':{'$in':[ObjectId(i['product_id']) for i in o['items']]}})}
    for i in o['items']:  # a product edited/removed since: keep the price the customer ordered at
        pm=pmap.setdefault(i['product_id'],{'price':i['unit_price']}); pm['sale_price']=i['unit_price']; pm['price']=i['unit_price']
    _,cfg=order_pricing_cfg(o.get('phone'),o.get('dealer_opt_in'),sum(i['quantity'] for i in items))
    coupon=db.coupons.find_one({'code':o.get('coupon_code')}) if o.get('coupon_code') else None
    prev=o.get('pricing') or {}
    pricing=calculate(items,pmap,o.get('district',''),method,coupon,cfg)
    pricing['dealer_discount_requires_approval']=prev.get('dealer_discount_requires_approval',False)
    return pricing

def change_allowed(o:dict):
    if o.get('order_status')!='Pending Confirmation': raise HTTPException(409,'This order is already confirmed by EMXIN, so the payment method cannot be changed now.')
    if o.get('payment_status') in PAID_STATES: raise HTTPException(409,'This order is already paid')
    if (o.get('manual_payment') or {}).get('status')=='pending': raise HTTPException(409,'Your payment is already being verified')

PAY_LABEL={'cod':'Cash on Delivery','paystation':'online payment','manual':'Send Money','bank':'bank transfer'}

@app.post('/api/v1/admin/orders/{order_id}/payment-to-cod')
def admin_payment_to_cod(order_id:str,authorization: str|None=Header(None)):
    """Admin: an unpaid online order becomes Cash on Delivery again (re-priced without the digital discount)."""
    actor=require_role(authorization,ORDER_WRITE)
    o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    change_allowed(o)
    pricing=reprice_order(o,'cod')
    if pricing.get('is_bulk'): raise HTTPException(400,'Bulk orders need an advance payment')
    old_total=float((o.get('pricing') or {}).get('grand_total') or 0)
    r=db.orders.update_one({'_id':o['_id'],'order_status':'Pending Confirmation'},{'$set':{'payment_method':'cod','pricing':pricing,'payment_status':'Unpaid','payment_channel':'cod','courier_billing_mode':'deduct_from_cod_collection','updated_at':now()},'$unset':{'manual_payment':''},
        '$push':{'timeline':{'at':now(),'payment_status':'Unpaid','note':'Payment changed to Cash on Delivery by EMXIN','role':'admin'}}})
    if not r.matched_count: raise HTTPException(409,'This order was confirmed just now, so the payment method cannot be changed.')
    if o.get('customer_id'): db.customers.update_one({'_id':ObjectId(o['customer_id'])},{'$inc':{'total_purchase':float(pricing['grand_total'])-old_total}})
    return serialize(db.orders.find_one({'_id':o['_id']}))

@app.get('/api/v1/orders/{order_id}/payment-options')
def payment_options(order_id:str,authorization: str|None=Header(None)):
    """What a customer would pay by bKash / Nagad for this order (before sending money), and where to send it."""
    ident=require_role(authorization,('customer',))
    o=db.orders.find_one({'order_id':order_id,'customer_id':ident['sub']})
    if not o: raise HTTPException(404,'Order not found')
    change_allowed(o)
    pr=reprice_order(o,'manual'); now_amount=float((o.get('pricing') or {}).get('grand_total') or 0)
    accs=commerce_settings().get('payment_accounts') or {}
    channels=[{'channel':k,'label':CHANNEL_LABEL[k],'number':a.get('number'),'account_type':a.get('account_type','personal')} for k,a in accs.items() if k in CHANNEL_LABEL and a.get('enabled') and a.get('number')]
    return {'order_id':order_id,'current_method':o.get('payment_method'),'current_total':now_amount,'channels':channels,'paystation_enabled':bool(settings.paystation_enabled),
            'send_amount':float(pr['advance_required'] if pr.get('is_bulk') else pr['grand_total']),'grand_total':pr['grand_total'],'payment_discount':pr['payment_discount'],
            'discount_percent':pr.get('digital_payment_discount_percent',0),'is_bulk':pr.get('is_bulk',False),'cod_due':pr.get('cod_due',0),'can_use_cod':not pr.get('is_bulk')}

@app.post('/api/v1/orders/{order_id}/change-payment')
def change_payment(order_id:str,body:PaymentChange,authorization: str|None=Header(None)):
    """Before EMXIN confirms, the customer can pay a COD order by bKash / Nagad (EMXIN verifies the TrxID), or go back to COD."""
    ident=require_role(authorization,('customer',))
    o=db.orders.find_one({'order_id':order_id,'customer_id':ident['sub']})
    if not o: raise HTTPException(404,'Order not found')
    change_allowed(o)
    prev=o.get('payment_method'); old_total=float((o.get('pricing') or {}).get('grand_total') or 0)
    if body.method=='cod':
        pricing=reprice_order(o,'cod')
        if pricing.get('is_bulk'): raise HTTPException(400,'Bulk orders need an advance payment by bKash / Nagad')
        upd={'payment_method':'cod','pricing':pricing,'payment_status':'Unpaid','payment_channel':'cod','courier_billing_mode':'deduct_from_cod_collection','updated_at':now()}
        note=f"Customer changed payment from {PAY_LABEL.get(prev,prev)} to Cash on Delivery"; unset={'manual_payment':''}
    else:
        pricing=reprice_order(o,'manual')
        mp=manual_payment_doc(body.channel,body.trx_id,body.sender_number,pricing,order_id)
        st='Awaiting Advance Verification' if pricing.get('is_bulk') else 'Awaiting Verification'
        upd={'payment_method':'manual','switched_from':prev,'pricing':pricing,'manual_payment':mp,'payment_channel':mp['channel'],'payment_status':st,
             'courier_billing_mode':'deduct_from_cod_collection' if pricing.get('cod_due',0)>0 else 'merchant_periodic_bill','updated_at':now()}
        note=f"Customer switched from {PAY_LABEL.get(prev,prev)} to {mp['channel_label']} Send Money · TrxID {mp['trx_id']} · ৳{mp['amount_expected']:,.0f} (to verify)"; unset={}
    r=db.orders.update_one({'_id':o['_id'],'order_status':'Pending Confirmation','payment_status':o.get('payment_status')},{'$set':upd,**({'$unset':unset} if unset else {}),'$push':{'timeline':{'at':now(),'payment_status':upd['payment_status'],'note':note,'role':'customer'}}})
    if not r.matched_count: raise HTTPException(409,'EMXIN confirmed this order just now, so the payment method cannot be changed. Please pay on delivery.')
    delta=float(pricing['grand_total'])-old_total
    if delta and o.get('customer_id'): db.customers.update_one({'_id':ObjectId(o['customer_id'])},{'$inc':{'total_purchase':delta}})
    n=db.orders.find_one({'_id':o['_id']})
    return {'ok':True,'order_id':order_id,'payment_method':n['payment_method'],'payment_status':n['payment_status'],'pricing':n['pricing'],'manual_payment':n.get('manual_payment')}

@app.post('/api/v1/payments/paystation/ipn')
async def paystation_ipn(payload: dict):
    """Quarantine unverified callbacks; never credit orders from caller-supplied fields."""
    invoice=str(payload.get('invoice_number',''))[:128]
    o=order_from_invoice(invoice) if invoice else None
    if not o: raise HTTPException(404,'Order not found')
    db.payment_callbacks.insert_one({'provider':'paystation','order_id':o['order_id'],'invoice_number':invoice,
                                     'status':'received','received_at':now(),'payload':payload})
    # The payload is only a hint; credit happens only after PayStation's own status API confirms it.
    try: result=await verify_paystation(o)
    except HTTPException: result={'paid':False}
    return {'status':'verified' if result.get('paid') else 'pending_verification'}

@app.get('/api/v1/payments/paystation/status/{order_id}')
async def paystation_status(order_id:str):
    o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    try: result=await PayStationClient().status(order_id)
    except IntegrationNotConfigured as e: raise HTTPException(503,str(e))
    return result

@app.get('/api/v1/orders/track')
def track(order_id:str=Query(...),phone:str=Query(...)):
    try: norm=normalize_bd_phone(phone)
    except HTTPException: raise HTTPException(404,'Order not found')
    oid=order_id.strip().upper()
    o=db.orders.find_one({'order_id':oid,'phone':{'$in':[norm,phone]}})
    if not o:
        b=binned_orders({'order_id':oid},1); o=b[0] if b and b[0].get('phone') in (norm,phone) else None
    if not o: raise HTTPException(404,'No order found with this Order ID and phone number. Please check both.')
    cancel_view(o)
    keep={k:o.get(k) for k in ['order_id','order_status','payment_status','pricing','courier','created_at','updated_at','items','district','cancelled_by','cancel_reason','cancelled_at']}
    keep['tracking_code']=(o.get('courier_data') or {}).get('consignment',{}).get('tracking_code') if isinstance(o.get('courier_data'),dict) else None
    keep['timeline']=[{k:v for k,v in t.items() if k in ('at','order_status','payment_status')} for t in o.get('timeline',[]) if t.get('order_status') or t.get('payment_status')]
    return serialize(keep)

# ---------- Admin ----------
@app.post('/api/v1/admin/login')
def admin_login(body: Login):
    a=db.admins.find_one({'email':body.email.lower()}) or db.staff.find_one({'email':body.email.lower(),'status':'active'})
    if not a or not verify_password(body.password,a['password_hash']): raise HTTPException(401,'Invalid login')
    role=a.get('role','super_admin')
    db.audit_logs.insert_one({'actor_id':str(a['_id']),'actor_role':role,'action':'login','created_at':now()})
    return {'access_token':create_token(str(a['_id']),role,body.remember),'role':role,'name':a.get('name',''),'must_change_password':bool(a.get('must_change_password'))}

def admin(authorization): return require_role(authorization,('admin','super_admin','sales','inventory','support','marketing'))
CATALOG=('super_admin','admin','inventory'); ORDER_WRITE=('super_admin','admin','sales','support'); CRM=('super_admin','admin','sales','support','marketing')
def manager(authorization,*extra): return require_role(authorization,('super_admin','admin')+extra)
def super_admin(authorization): return require_role(authorization,('super_admin',))

@app.get('/api/v1/admin/dashboard')
def admin_dashboard(authorization: str|None=Header(None)):
    admin(authorization)
    orders=list(db.orders.find().sort('created_at',-1).limit(8))
    pipeline=[{'$match':{'order_status':'Delivered'}},{'$group':{'_id':None,'sales':{'$sum':'$pricing.grand_total'},'count':{'$sum':1}}}]
    sold=list(db.orders.aggregate(pipeline)); delivered=sold[0] if sold else {'sales':0,'count':0}
    start,end=dhaka_day_bounds()
    yesterday_start,yesterday_end=dhaka_day_bounds(1)
    today_visitors=len(db.analytics_events.distinct('session_id',{'created_at':{'$gte':start,'$lt':end},'event_type':'page_view'}))
    yesterday_visitors=len(db.analytics_events.distinct('session_id',{'created_at':{'$gte':yesterday_start,'$lt':yesterday_end},'event_type':'page_view'}))
    today_orders=db.orders.count_documents({'created_at':{'$gte':start,'$lt':end}})
    today_paid=list(db.orders.aggregate([{'$match':{'created_at':{'$gte':start,'$lt':end},'payment_status':{'$in':['Paid','COD Collected']}}},{'$group':{'_id':None,'sales':{'$sum':'$pricing.grand_total'},'count':{'$sum':1}}}]))
    today_paid=today_paid[0] if today_paid else {'sales':0,'count':0}
    event_counts={}
    for e in ['product_view','add_to_cart','checkout_started']:
        event_counts[e]=db.analytics_events.count_documents({'created_at':{'$gte':start,'$lt':end},'event_type':e})
    conversion=round(today_orders/today_visitors*100,2) if today_visitors else 0
    return {'metrics':{'today_visitors':today_visitors,'today_purchases':today_orders,'today_paid_sales':today_paid['sales'],'conversion_rate':conversion,'orders':db.orders.count_documents({}),'pending':db.orders.count_documents({'order_status':'Pending Confirmation'}),'delivered':delivered['count'],'sales':delivered['sales'],'low_stock':db.products.count_documents({'stock':{'$lte':5},'status':'active'}),'quantity_requests':db.quantity_requests.count_documents({'status':'New'}),'dealers_pending':db.dealers.count_documents({'status':'Pending'}),'registered_customers':db.customers.count_documents({}),'registered_no_order':db.customers.count_documents({'total_orders':0})},'today_funnel':{'visitors':today_visitors,'product_views':event_counts['product_view'],'add_to_cart':event_counts['add_to_cart'],'checkout_started':event_counts['checkout_started'],'orders_placed':today_orders,'paid_orders':today_paid['count']},'visitor_change_percent':round((today_visitors-yesterday_visitors)/yesterday_visitors*100,1) if yesterday_visitors else None,'recent_orders':serialize(orders)}

@app.get('/api/v1/admin/analytics/daily')
def admin_analytics_daily(days:int=7,authorization: str|None=Header(None)):
    admin(authorization)
    days=max(1,min(days,30))
    result=[]
    for offset in reversed(range(days)):
        start,end=dhaka_day_bounds(offset)
        visitors=len(db.analytics_events.distinct('session_id',{'created_at':{'$gte':start,'$lt':end},'event_type':'page_view'}))
        purchases=db.orders.count_documents({'created_at':{'$gte':start,'$lt':end},'payment_status':{'$in':['Paid','COD Collected']}})
        result.append({'date':start.astimezone(ZoneInfo('Asia/Dhaka')).strftime('%d %b'),'visitors':visitors,'purchases':purchases})
    return {'days':result}

@app.get('/api/v1/admin/customers')
def admin_customers(authorization: str|None=Header(None),status:str|None=None,priority:str|None=None,no_order:bool=False):
    require_role(authorization,CRM); q={}
    if status:q['lead_status']=status
    if priority:q['lead_priority']=priority
    if no_order:q['total_orders']=0
    docs=list(db.customers.find(q,{'password_hash':0}).sort('last_active_at',-1).limit(500))
    # activity per person: /admin/people/{id} (one query per person was very slow with many customers)
    return serialize(docs)

@app.put('/api/v1/admin/customers/{customer_id}/crm')
def update_customer_crm(customer_id:str,payload:dict,authorization: str|None=Header(None)):
    require_role(authorization,CRM)
    allowed={k:v for k,v in payload.items() if k in {'lead_status','lead_priority','assigned_sales_person','next_followup_at','sales_notes'}}
    allowed['updated_at']=now(); db.customers.update_one({'_id':ObjectId(customer_id)},{'$set':allowed})
    return {'ok':True}

@app.get('/api/v1/admin/orders')
def admin_orders(authorization: str|None=Header(None),status:str|None=None):
    admin(authorization); q={}
    if status:q['order_status']=status
    return serialize(list(db.orders.find(q).sort('created_at',-1).limit(200)))

@app.post('/api/v1/admin/orders/{order_id}/confirm')
async def confirm_order(order_id:str,authorization: str|None=Header(None)):
    require_role(authorization,ORDER_WRITE)
    o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    if o.get('order_status') in ('Sent to Courier','Delivered','Cancelled'):
        return serialize(o)
    if manual_unverified(o): raise HTTPException(409,'Verify the bKash/Nagad payment first')
    if o.get('payment_method')=='paystation' and o.get('payment_status') not in PAID_STATES:
        raise HTTPException(409,'The online payment is not done yet (COD would be ৳0). Use "Switch to Cash on Delivery" first, or wait for the payment.')
    db.orders.update_one({'_id':o['_id']},{'$set':{'order_status':'Confirmed','confirmed_at':now(),'updated_at':now()},'$push':{'timeline':{'at':now(),'order_status':'Confirmed','note':'Order confirmed by EMXIN'}}})
    queue_sms('order-confirmed-'+order_id,o['phone'],t_order_confirmed(o),'order',order_id=order_id)
    # Business rule: after EMXIN calls the customer and Admin confirms, create the default
    # Steadfast consignment automatically. Nothing is sent to courier before this click.
    if settings.courier_default=='steadfast' and settings.steadfast_enabled:
        refreshed=db.orders.find_one({'_id':o['_id']})
        try: await steadfast_create(refreshed)
        except IntegrationNotConfigured: pass
        except Exception as e:  # order stays Confirmed; Admin can press "Send to Steadfast" again
            log.error('Steadfast create failed for %s: %s',order_id,str(e)[:300])
            db.orders.update_one({'_id':o['_id']},{'$push':{'timeline':{'at':now(),'note':f'Steadfast did not accept the parcel: {str(e)[:160]}','role':'system'}}})
    return serialize(db.orders.find_one({'_id':o['_id']}))

@app.post('/api/v1/admin/orders/{order_id}/cancel')
def cancel_order(order_id:str,payload:dict|None=Body(None),authorization: str|None=Header(None)):
    """EMXIN cancels: the customer gets an SMS (no reason) and sees 'Cancelled by EMXIN' + the reason in My Orders / Track Order."""
    actor=require_role(authorization,ORDER_WRITE); o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    if o.get('order_status') in ('Delivered','Completed'): raise HTTPException(409,'Delivered orders must be marked Returned, not cancelled')
    reason=str((payload or {}).get('reason') or '').strip()[:300]
    done=db.orders.find_one_and_update({'_id':o['_id'],'order_status':{'$nin':['Cancelled','Returned']}},
        {'$set':{'order_status':'Cancelled','cancelled_by':'emxin','cancel_reason':reason,'cancelled_at':now(),'updated_at':now()},
         '$push':{'timeline':{'at':now(),'order_status':'Cancelled','note':'Cancelled by EMXIN'+(f': {reason}' if reason else ''),'by':actor.get('sub'),'role':actor.get('role')}}})
    if done:  # only the first click releases stock and sends the SMS
        release_stock(done)
        queue_sms('order-cancelled-'+order_id,o['phone'],t_order_cancelled(o),'order',order_id=order_id)
    return {'ok':True}

@app.post('/api/v1/admin/orders/{order_id}/send-courier')
async def send_courier(order_id:str,courier:str='steadfast',authorization: str|None=Header(None)):
    require_role(authorization,ORDER_WRITE); o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    if o['order_status'] not in ('Confirmed','Approved'): raise HTTPException(409,'Confirm the customer/order first')
    if manual_unverified(o): raise HTTPException(409,'Verify the bKash/Nagad payment first')
    if courier=='steadfast':
        try: data=await steadfast_create(o)
        except IntegrationNotConfigured as e: raise HTTPException(503,str(e))
        except Exception as e: raise HTTPException(502,f'Steadfast did not accept the parcel: {str(e)[:200]}')
        return {'ok':True,'courier':courier,'data':data}
    try:
        if courier=='pathao': data=await PathaoClient().create_order(o)
        else: raise HTTPException(400,'Unsupported courier')
    except IntegrationNotConfigured as e: raise HTTPException(503,str(e))
    db.orders.update_one({'order_id':order_id},{'$set':{'order_status':'Sent to Courier','courier':courier,'courier_data':data,'updated_at':now()},'$push':{'timeline':{'at':now(),'order_status':'Sent to Courier','note':f'{courier.title()} consignment created'}}})
    return {'ok':True,'courier':courier,'data':data}

@app.get('/api/v1/admin/quantity-requests')
def admin_requests(authorization: str|None=Header(None)):
    require_role(authorization,CRM); order={'Urgent':0,'Priority':1,'Normal':2}
    docs=list(db.quantity_requests.find().sort('created_at',-1).limit(200)); docs.sort(key=lambda x:(order.get(x.get('urgency'),9),-x['created_at'].timestamp()))
    return serialize(docs)

@app.get('/api/v1/admin/dealers')
def admin_dealers(authorization: str|None=Header(None)):
    admin(authorization); return serialize(enrich_dealers(list(db.dealers.find({}, {'password_hash':0}).sort('created_at',-1))))

@app.post('/api/v1/admin/dealers/{dealer_id}/approve')
def approve_dealer(dealer_id:str,authorization: str|None=Header(None)):
    manager(authorization)
    try: oid=ObjectId(dealer_id)
    except Exception: raise HTTPException(400,'Invalid dealer id')
    d=db.dealers.find_one({'_id':oid})
    if not d: raise HTTPException(404,'Dealer not found')
    db.dealers.update_one({'_id':oid},{'$set':{'status':'Active','discount_approved':True,'approved_at':d.get('approved_at') or now(),'updated_at':now()},**({'$push':{'status_history':{'at':now(),'status':'Active','note':'Approved'}}} if d.get('status')!='Active' else {})})
    code=ensure_dealer_code(d)  # EMX-DLR-70001, 70002, … given once, on first approval
    if d.get('status')=='Suspended':  # back from suspension: its own SMS (the "approved" one goes only once)
        queued=queue_sms(f"dealer-reactivated-{dealer_id}-{len(d.get('status_history') or [])}",d['phone'],t_dealer_reactivated(code),'dealer')
    else:
        queued=queue_sms('dealer-approved-'+dealer_id,d['phone'],t_dealer_approved(code),'dealer') if d.get('status')!='Active' else False
    return {'ok':True,'dealer_code':code,'sms_queued':queued}

@app.get('/api/v1/admin/products')
def admin_products(authorization: str|None=Header(None)):
    admin(authorization); return serialize(list(db.products.find({},LIST_HIDE).sort('created_at',-1)))  # list only: the editor loads the full product

@app.get('/api/v1/admin/product-next-codes')
def product_next_codes(category: str='',brand: str='',model: str='',exclude: str='',authorization: str|None=Header(None)):
    require_role(authorization,CATALOG)
    return next_product_codes(db,category,brand,model,ObjectId(exclude) if ObjectId.is_valid(exclude) else None)

@app.post('/api/v1/admin/products')
def create_product(body:ProductInput,authorization: str|None=Header(None)):
    require_role(authorization,CATALOG); d=body.model_dump(); d['slug']=slugify(d.get('slug') or '') or product_slug(d['name'],d.get('model',''))
    if db.products.find_one({'slug':d['slug']}): raise HTTPException(409,'A product with this slug already exists')
    if d.get('sku') and db.products.find_one({'sku':d['sku']},{'_id':1}): raise HTTPException(409,f"SKU {d['sku']} is already used by another product")
    codes=next_product_codes(db,d.get('category_slug',''),d.get('brand_slug',''),d.get('model',''))
    if not d.get('sku'): d['sku']=codes['sku']
    if not d.get('compare_note'): d['compare_note']=codes['compare_note']
    d.update({'reserved':0,'sold_count':0,'rating':0,'review_count':0,'created_at':now(),'updated_at':now()}); r=db.products.insert_one(d); return {'id':str(r.inserted_id),'slug':d['slug']}

@app.put('/api/v1/admin/products/{product_id}')
def update_product(product_id:str,body:ProductInput,authorization: str|None=Header(None)):
    require_role(authorization,CATALOG); d=body.model_dump(); d['slug']=slugify(d.get('slug') or '') or product_slug(d['name'],d.get('model','')); d['updated_at']=now()
    if not ObjectId.is_valid(product_id): raise HTTPException(400,'Invalid product id')
    if d.get('sku') and db.products.find_one({'sku':d['sku'],'_id':{'$ne':ObjectId(product_id)}},{'_id':1}): raise HTTPException(409,f"SKU {d['sku']} is already used by another product")
    if db.products.find_one({'slug':d['slug'],'_id':{'$ne':ObjectId(product_id)}}): raise HTTPException(409,'Another product already uses this slug')
    db.products.update_one({'_id':ObjectId(product_id)},{'$set':d}); return {'ok':True}

@app.post('/api/v1/admin/categories')
def create_category(body:CategoryInput,authorization: str|None=Header(None)):
    require_role(authorization,CATALOG); d=body.model_dump(); d['slug']=d.get('slug') or slugify(d['name']); db.categories.update_one({'slug':d['slug']},{'$set':d},upsert=True); return {'ok':True}

@app.post('/api/v1/admin/brands')
def create_brand(body:BrandInput,authorization: str|None=Header(None)):
    require_role(authorization,CATALOG); d=body.model_dump(); d['slug']=d.get('slug') or slugify(d['name']); db.brands.update_one({'slug':d['slug']},{'$set':d},upsert=True); return {'ok':True}

@app.get('/api/v1/admin/cms')
def get_cms(authorization: str|None=Header(None)):
    admin(authorization); return {'homepage':serialize(db.homepage.find_one({'key':'home'},{'_id':0})),'settings':serialize(commerce_settings())}

@app.get('/api/v1/admin/cms/versions')
def cms_versions(authorization: str|None=Header(None)):
    admin(authorization)
    return serialize(list(db.cms_versions.find({}, {'snapshot':0}).sort('created_at',-1).limit(30)))

@app.post('/api/v1/admin/cms/restore/{version_id}')
def restore_cms(version_id:str,authorization: str|None=Header(None)):
    manager(authorization,'marketing')
    try: version=db.cms_versions.find_one({'_id':ObjectId(version_id)})
    except Exception: raise HTTPException(400,'Invalid version ID')
    if not version: raise HTTPException(404,'Version not found')
    current=db.homepage.find_one({'key':'home'},{'_id':0}) or {}
    db.cms_versions.insert_one({'snapshot':current,'created_at':now(),'action':'before_restore'})
    restored={k:v for k,v in version['snapshot'].items() if k not in ('_id','key')}
    restored['updated_at']=now()
    db.homepage.replace_one({'key':'home'},{'key':'home',**restored},upsert=True)
    return {'ok':True}

@app.put('/api/v1/admin/cms/homepage')
def update_homepage(payload:dict,authorization: str|None=Header(None)):
    manager(authorization,'marketing')
    allowed={'product_sort','hero','promo','sections','branding','links','policies','trust','dealer_benefits','footer','coming_soon','announcement','banner','category_section','featured_section','seo','hidden_sections','smart_section'}
    if set(payload)-allowed-{'key','updated_at','_id'}: raise HTTPException(400,'Unexpected homepage fields')
    if 'sections' in payload and (not isinstance(payload['sections'],list) or len(payload['sections'])>30 or any(not isinstance(x,str) for x in payload['sections'])):
        raise HTTPException(400,'Invalid homepage sections')
    current=db.homepage.find_one({'key':'home'},{'_id':0}) or {}
    db.cms_versions.insert_one({'snapshot':current,'created_at':now(),'action':'before_publish'})
    if 'product_sort' in payload and payload['product_sort'] not in PRODUCT_SORTS: raise HTTPException(400,'Invalid product order')
    cleaned={k:v for k,v in payload.items() if k in allowed}
    cleaned['updated_at']=now()
    db.homepage.update_one({'key':'home'},{'$set':cleaned},upsert=True)
    return {'ok':True}


@app.put('/api/v1/admin/settings/commerce')
def update_commerce(payload:dict,authorization: str|None=Header(None)):
    manager(authorization)
    permitted={'dhaka_delivery_charge','outside_dhaka_delivery_charge','estimated_shipping_from_qty','extra_shipping_per_kg','bulk_threshold_qty','bulk_discount_percent','bulk_advance_percent','digital_payment_discount_percent','payment_accounts','return_label','express_surcharge_by_district','dealer_tiers','retail_max_qty_per_product'}
    cleaned={k:v for k,v in payload.items() if k in permitted}
    for key in permitted & cleaned.keys():
        if key.endswith('_percent') and (not isinstance(cleaned[key],(int,float)) or not 0<=cleaned[key]<=100): raise HTTPException(400,f'Invalid {key}')
        if key.endswith('_charge') or key in ('estimated_shipping_from_qty','extra_shipping_per_kg','bulk_threshold_qty'):
            if not isinstance(cleaned[key],(int,float)) or cleaned[key]<0: raise HTTPException(400,f'Invalid {key}')
    if 'express_surcharge_by_district' in cleaned:
        rates=cleaned['express_surcharge_by_district']
        if not isinstance(rates,dict) or len(rates)>100 or any(not isinstance(k,str) or not isinstance(v,(int,float)) or v<0 for k,v in rates.items()):
            raise HTTPException(400,'Invalid express surcharge rates')
    if 'dealer_tiers' in cleaned:
        t=cleaned['dealer_tiers']
        if not isinstance(t,list) or not 1<=len(t)<=6 or any(not isinstance(x,(int,float)) or not 0<=x<=50 for x in t): raise HTTPException(400,'Dealer tiers must be 1-6 percentages between 0 and 50')
    cleaned['updated_at']=now()
    db.settings.update_one({'key':'commerce'},{'$set':cleaned},upsert=True)
    return {'ok':True}

@app.get('/api/v1/admin/ledger')
def ledger(type:str='',q:str='',start:str='',end:str='',limit:int=300,authorization: str|None=Header(None)):
    """Money book: every entry with its order's customer and payment, plus totals for the same filter."""
    admin(authorization)
    f={}
    if type: f['type']=type
    if q.strip():
        rx={'$regex':re.escape(q.strip()),'$options':'i'}
        ids=[o['order_id'] for o in db.orders.find({'$or':[{'order_id':rx},{'customer_name':rx},{'phone':rx}]},{'order_id':1}).limit(300)]
        f['order_id']={'$in':ids}
    rng={}
    try:
        if start: rng['$gte']=datetime.strptime(start,'%Y-%m-%d').replace(tzinfo=DHAKA).astimezone(timezone.utc)
        if end: rng['$lt']=(datetime.strptime(end,'%Y-%m-%d').replace(tzinfo=DHAKA)+timedelta(days=1)).astimezone(timezone.utc)
    except ValueError: raise HTTPException(400,'Dates must be YYYY-MM-DD')
    if rng: f['created_at']=rng
    rows=list(db.ledger.find(f).sort('created_at',-1).limit(max(1,min(limit,2000))))
    oids=list({r.get('order_id') for r in rows if r.get('order_id')})
    om={o['order_id']:o for o in db.orders.find({'order_id':{'$in':oids}},{'order_id':1,'customer_name':1,'phone':1,'payment_method':1,'payment_channel':1,'payment_status':1,'order_status':1,'manual_payment.channel':1,'manual_payment.trx_id':1,'dealer_id':1})}
    for r in rows:
        o=om.get(r.get('order_id'))
        r['order']=({k:o.get(k) for k in ('customer_name','phone','payment_method','payment_channel','payment_status','order_status','dealer_id')}|{'trx_id':(o.get('manual_payment') or {}).get('trx_id')}) if o else None
        if r.get('payment_method')=='manual': r['channel']=(o or {}).get('payment_channel') or ((o or {}).get('manual_payment') or {}).get('channel')
    tot={x['_id']:{'amount':x['a'],'count':x['n']} for x in db.ledger.aggregate([{'$match':{k:v for k,v in f.items() if k!='type'}},{'$group':{'_id':'$type','a':{'$sum':'$amount'},'n':{'$sum':1}}}])}
    return serialize({'rows':rows,'totals':tot})


# ---------- Admin media / staff ----------
@app.post('/api/v1/admin/media/presign')
def admin_media_presign(body: MediaPresign,authorization: str|None=Header(None)):
    admin(authorization)
    if not re.fullmatch(r'(image/(png|jpe?g|webp|gif|svg\+xml|avif|x-icon|vnd\.microsoft\.icon)|video/(mp4|webm|quicktime))',body.content_type):
        raise HTTPException(400,'Only images (PNG, JPG, WebP, GIF, SVG, AVIF, ICO) and videos (MP4, WebM, MOV) are allowed')
    limit=(300 if body.content_type.startswith('video/') else 15)*1024*1024
    if body.size and body.size>limit: raise HTTPException(400,f'File too large (max {limit//1024//1024} MB)')
    ext=(body.filename.rsplit('.',1)[-1].lower() if '.' in body.filename else 'bin')
    key=media_key(body.folder,ext,body.content_type.startswith('video/'),body.filename)
    db.media_reserved.insert_one({'key':key,'created_at':now()})
    client=s3_client()
    post=client.generate_presigned_post(Bucket=settings.aws_s3_bucket,Key=key,Fields={'Content-Type':body.content_type},Conditions=[{'Content-Type':body.content_type},['content-length-range',1,limit]],ExpiresIn=settings.s3_presigned_upload_expire_seconds)
    return {'upload':post,'key':key,'public_url':media_public_url(key),'expires_in':settings.s3_presigned_upload_expire_seconds}

@app.post('/api/v1/admin/media/library')
def media_library_add(body: MediaRecord,authorization: str|None=Header(None)):
    actor=admin(authorization)
    if not body.key.startswith(settings.aws_s3_prefix.strip('/')+'/'): raise HTTPException(400,'Key outside media prefix')
    doc={**body.model_dump(),'url':media_public_url(body.key),'name':body.key.rsplit('/',1)[-1],'original_name':body.name,'uploaded_by':actor['sub'],'created_at':now()}
    r=db.media_library.update_one({'key':body.key},{'$setOnInsert':doc},upsert=True)
    if r.upserted_id and body.type=='video':
        try: queue_video(body.key,s3_client())
        except Exception: pass
    return serialize(db.media_library.find_one({'key':body.key}))

# ---------- Media naming convention ----------
# <prefix>/<section>/<group>/<group>[-role][-video]-NN.<ext>
#   product/aimb-g2-pro/aimb-g2-pro-01.webp        (01 = cover, in gallery order)
#   product/aimb-g2-pro/aimb-g2-pro-video-01.mp4
#   product/aimb-g2-pro/aimb-g2-pro-banner-01.webp (Product Details overview banner)
#   category/smart-glasses/smart-glasses-tile-01.webp
#   homepage/hero/hero-01.webp · branding/favicon/favicon-01.png · brand/aimb/aimb-logo-01.png
#   library/unsorted/<original-name>.jpg            (uploaded without a section / not used anywhere)
LEGACY_FOLDER={'hero':'homepage/hero','promo':'homepage/promo','banner':'homepage/banner','video':'homepage/hero-video','logo':'branding/logo','favicon':'branding/favicon','branding':'branding/logo','category':'category/unsorted','product':'product/unsorted','dealer':'dealer/documents','payment':'payment/proofs'}
def media_base(folder:str,is_video:bool,filename:str='')->tuple[str,str]:
    folder=LEGACY_FOLDER.get(folder,folder); parts=folder.split('/')
    if parts[0]=='library' or (len(parts)>1 and parts[1]=='unsorted'):
        return '/'.join(parts if len(parts)>1 else parts+['unsorted']), slugify((filename or 'file').rsplit('.',1)[0])[:60] or 'file'
    section,rest=parts[0],parts[1:]
    if section=='category' and len(rest)==1: rest=rest+['tile']
    if section=='brand' and len(rest)==1: rest=rest+['logo']
    base='-'.join(rest or [section])+('-video' if is_video and section=='product' and len(rest)==1 else '')
    return f"{section}/{rest[0]}" if rest else section, base
def taken_keys()->set:
    # library files + names handed out in the last hour (parallel uploads must not get the same number)
    recent={r['key'] for r in db.media_reserved.find({'created_at':{'$gte':now()-timedelta(hours=1)}},{'key':1})}
    return {r['key'] for r in db.media_library.find({},{'key':1})}|recent
def media_key(folder:str,ext:str,is_video:bool=False,filename:str='',n:int|None=None,taken:set|None=None)->str:
    d,base=media_base(folder,is_video,filename); pre=settings.aws_s3_prefix.strip('/'); taken=taken_keys() if taken is None else taken
    if d.startswith('library/') or d.endswith('/unsorted'):
        k=f"{pre}/{d}/{base}.{ext}"; i=2
        while k in taken: k=f"{pre}/{d}/{base}-{i}.{ext}"; i+=1
        return k
    used=[int(x) for x in (re.fullmatch(rf"{re.escape(pre)}/{re.escape(d)}/{re.escape(base)}-(\d+)\.\w+",k) for k in taken) for x in ([x.group(1)] if x else [])]
    i=n or (max(used)+1 if used else 1)
    while any(k.startswith(f"{pre}/{d}/{base}-{i:02d}.") for k in taken): i+=1
    return f"{pre}/{d}/{base}-{i:02d}.{ext}"

def replace_url_everywhere(old:str,new:str):
    for p in db.products.find({'$or':[{'images':old},{'media.url':old},{'video_url':old},{'promo_image_url':old}]}):
        upd={'images':[new if u==old else u for u in (p.get('images') or [])],'media':[{**x,'url':new} if isinstance(x,dict) and x.get('url')==old else x for x in (p.get('media') or [])]}
        if p.get('video_url')==old: upd['video_url']=new
        if p.get('promo_image_url')==old: upd['promo_image_url']=new
        db.products.update_one({'_id':p['_id']},{'$set':upd})
    db.categories.update_many({'thumbnail_url':old},{'$set':{'thumbnail_url':new}})
    db.categories.update_many({'banner_url':old},{'$set':{'banner_url':new}})
    db.brands.update_many({'logo_url':old},{'$set':{'logo_url':new}})
    db.media_versions.update_many({'url':old},{'$set':{'url':new}})
    hp=db.homepage.find_one({'key':'home'})
    if hp and old in str(hp):
        def sub(v):
            if isinstance(v,dict): return {k:sub(x) for k,x in v.items()}
            if isinstance(v,list): return [sub(x) for x in v]
            return new if v==old else v
        db.homepage.replace_one({'_id':hp['_id']},sub(hp))

def media_plan()->list[dict]:
    """Works out the conventional name for every library file from where it is used (first use wins)."""
    pre=settings.aws_s3_prefix.strip('/'); want:dict={}
    def claim(url,folder,n=None,video=False):
        if isinstance(url,str) and url and url not in want: want[url]=(folder,n,video)
    for p in db.products.find({},{'slug':1,'name':1,'images':1,'media':1,'video_url':1,'promo_image_url':1}).sort([('sort_order',1),('created_at',1)]):
        slug=p.get('slug') or slugify(p.get('name','product'))
        media=[x for x in (p.get('media') or []) if isinstance(x,dict)] or [{'url':u,'type':'image'} for u in (p.get('images') or [])]+([{'url':p['video_url'],'type':'video'}] if p.get('video_url') else [])
        imgs=[x['url'] for x in media if x.get('type')!='video']; vids=[x['url'] for x in media if x.get('type')=='video']
        for i,u in enumerate(imgs,1): claim(u,f'product/{slug}',i)
        for i,u in enumerate(vids,1): claim(u,f'product/{slug}',i,True)
        claim(p.get('promo_image_url'),f'product/{slug}/banner')
    for c in db.categories.find({},{'slug':1,'thumbnail_url':1,'banner_url':1}).sort('order',1):
        claim(c.get('thumbnail_url'),f"category/{c['slug']}"); claim(c.get('banner_url'),f"category/{c['slug']}/banner")
    for b in db.brands.find({},{'slug':1,'logo_url':1}): claim(b.get('logo_url'),f"brand/{b.get('slug') or 'brand'}")
    hp=db.homepage.find_one({'key':'home'},{'_id':0}) or {}
    slots={'hero.image':'homepage/hero','hero.video_url':'homepage/hero-video','promo.image':'homepage/promo-banner','coming_soon.image':'homepage/coming-soon','banner.image':'homepage/banner',
           'branding.logo_url':'branding/header-logo','branding.logo_dark_url':'branding/footer-logo','branding.favicon_url':'branding/favicon','branding.product_banner_url':'branding/product-banner','seo.image':'branding/share-image'}
    for path,folder in slots.items():
        v=hp
        for k in path.split('.'): v=v.get(k) if isinstance(v,dict) else None
        claim(v,folder,video=path.endswith('video_url'))
    rows=list(db.media_library.find({}).sort('created_at',1)); taken={r['key'] for r in rows}; plan=[]
    for r in rows:
        ext=r['key'].rsplit('.',1)[-1].lower() if '.' in r['key'] else 'bin'
        folder,n,video=want.get(r['url'],('library/unsorted',None,r.get('type')=='video'))
        orig=r.get('original_name') or r.get('name') or r['key'].rsplit('/',1)[-1]
        d,base=media_base(folder,video or r.get('type')=='video',orig)
        # already correctly named? keep it
        if d.startswith('library/') and r['key'].startswith(f'{pre}/{d}/'): continue
        # already in the right folder with the right name pattern -> keep (later re-ordering never renames again)
        if not d.startswith('library/') and re.fullmatch(rf"{re.escape(pre)}/{re.escape(d)}/{re.escape(base)}-\d+\.\w+",r['key']): continue
        others=taken-{r['key']}
        new=media_key(folder,ext,video or r.get('type')=='video',orig,n,others)
        if new==r['key']: continue
        taken.discard(r['key']); taken.add(new)
        plan.append({'id':str(r['_id']),'from':r['key'],'to':new,'old_url':r['url'],'new_url':media_public_url(new),'name':new.rsplit('/',1)[-1],'original_name':orig,'type':r.get('type','image')})
    return plan

@app.post('/api/v1/admin/media/optimize-images')
def media_optimize_images(body: MediaOrganize,authorization: str|None=Header(None)):
    """Shrinks big images uploaded before automatic compression (same address, WebP, max 2400 px). dry_run=True only counts."""
    manager(authorization); items=big_images()
    total=sum(int(x.get('size') or 0) for x in items)
    if body.dry_run: return {'count':len(items),'total_mb':round(total/1048576,1)}
    return {'started':optimize_existing_images(s3_client()),'total_mb':round(total/1048576,1)}

@app.post('/api/v1/admin/media/organize')
def media_organize(body: MediaOrganize,authorization: str|None=Header(None)):
    """Renames existing S3 files to the naming convention and updates every place that uses them. dry_run=True only previews."""
    actor=manager(authorization); plan=media_plan()
    if body.dry_run: return {'count':len(plan),'plan':plan[:500]}
    s3=s3_client(); b=settings.aws_s3_bucket; done=0; failed=[]
    for x in plan:
        try:
            s3.copy_object(Bucket=b,Key=x['to'],CopySource={'Bucket':b,'Key':x['from']},MetadataDirective='COPY')
            replace_url_everywhere(x['old_url'],x['new_url'])
            db.media_library.update_one({'_id':ObjectId(x['id'])},{'$set':{'key':x['to'],'url':x['new_url'],'name':x['name'],'original_name':x['original_name'],'renamed_at':now()}})
            try: s3.delete_object(Bucket=b,Key=x['from'])
            except Exception: pass
            done+=1
        except Exception as e:
            failed.append({'file':x['original_name'],'error':str(e)[:160]})
    db.audit_logs.insert_one({'actor_id':actor['sub'],'actor_role':actor.get('role'),'action':'media_organized','target_id':f'{done} files','created_at':now()})
    return {'renamed':done,'failed':failed}

HOME_SLOTS={'hero.image':'Homepage hero','hero.video_url':'Hero video','promo.image':'Promo banner','branding.logo_url':'Header logo','branding.logo_dark_url':'Footer logo','branding.favicon_url':'Favicon','branding.product_banner_url':'Product page banner','seo.image':'Share image (SEO)'}
def media_usage()->dict:
    """url -> where it is used: [{kind:'product'|'category'|'homepage', id, label, where}]"""
    use:dict={}
    def add(url,item):
        if isinstance(url,str) and url.startswith('http'): use.setdefault(url,[]).append(item)
    for p in db.products.find({},{'name':1,'images':1,'media':1,'video_url':1,'promo_image_url':1,'status':1}):
        it={'kind':'product','id':str(p['_id']),'label':p.get('name',''),'status':p.get('status','')}
        urls=set(p.get('images') or [])|{m.get('url') for m in (p.get('media') or []) if isinstance(m,dict)}|{p.get('video_url')}
        for u in urls: add(u,{**it,'where':'Gallery'})
        add(p.get('promo_image_url'),{**it,'where':'Promo image'})
    for c in db.categories.find({},{'slug':1,'name':1,'thumbnail_url':1,'banner_url':1}):
        add(c.get('thumbnail_url'),{'kind':'category','id':c['slug'],'label':c.get('name',''),'where':'Category tile'})
        add(c.get('banner_url'),{'kind':'category','id':c['slug'],'label':c.get('name',''),'where':'Product page banner'})
    for b in db.brands.find({},{'slug':1,'name':1,'logo_url':1}):
        add(b.get('logo_url'),{'kind':'brand','id':b.get('slug'),'label':b.get('name',''),'where':'Brand logo'})
    def walk(v,path):
        if isinstance(v,dict):
            for k,x in v.items(): walk(x,f'{path}.{k}' if path else k)
        elif isinstance(v,list):
            for x in v: walk(x,path)
        elif isinstance(v,str) and v.startswith('http') and not path.startswith('links'):
            add(v,{'kind':'homepage','id':path,'label':HOME_SLOTS.get(path,'Homepage: '+path.replace('.',' › ')),'where':'Homepage'})
    walk({k:v for k,v in (db.homepage.find_one({'key':'home'},{'_id':0}) or {}).items()},'')
    return use

@app.get('/api/v1/admin/media/library')
def media_library_list(type: str|None=None,q: str|None=None,folder: str|None=None,page:int=1,authorization: str|None=Header(None)):
    """folder: '' all · 'unused' · 'homepage' · 'categories' · 'product:<id>'. Folders are worked out from where each file is used."""
    admin(authorization); f={}
    if type in ('image','video'): f['type']=type
    if q: f['name']={'$regex':re.escape(q),'$options':'i'}
    use=media_usage(); rows=list(db.media_library.find(f).sort('created_at',-1))
    for r in rows: r['used_in']=use.get(r.get('url'),[])
    products:dict={}
    for r in rows:
        for u in r['used_in']:
            if u['kind']=='product':
                e=products.setdefault(u['id'],{'id':u['id'],'name':u['label'],'count':0,'cover':''})
                e['count']+=1; e['cover']=e['cover'] or (r['url'] if r.get('type')=='image' else '')
    folders={'all':len(rows),'unused':sum(not r['used_in'] for r in rows),
             'homepage':sum(any(u['kind']=='homepage' for u in r['used_in']) for r in rows),
             'categories':sum(any(u['kind']=='category' for u in r['used_in']) for r in rows),
             'products':sorted(products.values(),key=lambda x:x['name'].lower())}
    if folder=='unused': rows=[r for r in rows if not r['used_in']]
    elif folder in ('homepage','categories'):
        kind={'homepage':'homepage','categories':'category'}[folder]; rows=[r for r in rows if any(u['kind']==kind for u in r['used_in'])]
    elif folder and folder.startswith('product:'):
        pid=folder.split(':',1)[1]; rows=[r for r in rows if any(u['kind']=='product' and u['id']==pid for u in r['used_in'])]
    page=max(1,page); total=len(rows)
    return {'total':total,'page':page,'folders':folders,'rows':serialize(rows[(page-1)*60:page*60])}

@app.post('/api/v1/admin/media/use')
def media_use(body: MediaUse,authorization: str|None=Header(None)):
    """Put a library file to work: add to a product gallery, set a category tile, or a homepage slot."""
    m=db.media_library.find_one({'url':body.url})
    if not m: raise HTTPException(404,'File is not in the Media Library')
    kind=m.get('type','image')
    if body.target=='product':
        require_role(authorization,CATALOG)
        if not ObjectId.is_valid(body.id or ''): raise HTTPException(400,'Choose a product')
        p=db.products.find_one({'_id':ObjectId(body.id)},{'media':1,'images':1,'video_url':1,'name':1})
        if not p: raise HTTPException(404,'Product not found')
        media=list(p.get('media') or [])
        if not media: media=[{'url':u,'type':'image'} for u in (p.get('images') or [])]+([{'url':p['video_url'],'type':'video'}] if p.get('video_url') else [])
        if any(x.get('url')==body.url for x in media): return {'ok':True,'message':f"Already in {p.get('name')}"}
        media.append({'url':body.url,'type':kind,'name':m.get('name')})
        upd={'media':media,'images':[x['url'] for x in media if x.get('type')=='image'],'video_url':next((x['url'] for x in media if x.get('type')=='video'),''),'updated_at':now()}
        db.products.update_one({'_id':p['_id']},{'$set':upd}); return {'ok':True,'message':f"Added to {p.get('name')}"}
    if body.target=='category':
        require_role(authorization,CATALOG)
        r=db.categories.update_one({'slug':body.id},{'$set':{'thumbnail_url':body.url,'updated_at':now()}})
        if not r.matched_count: raise HTTPException(404,'Category not found')
        return {'ok':True,'message':'Category tile updated'}
    manager(authorization,'marketing')
    path={'hero':'hero.image','promo':'promo.image','product_banner':'branding.product_banner_url','logo':'branding.logo_url','logo_dark':'branding.logo_dark_url','favicon':'branding.favicon_url','hero_video':'hero.video_url'}[body.target]
    if (kind=='video')!=(body.target=='hero_video'): raise HTTPException(400,'That slot needs '+('a video' if body.target=='hero_video' else 'an image'))
    db.homepage.update_one({'key':'home'},{'$set':{path:body.url,'updated_at':now()}},upsert=True)
    return {'ok':True,'message':HOME_SLOTS.get(path,path)+' updated'}

@app.delete('/api/v1/admin/media/library/{media_id}')
def media_library_delete(media_id:str,confirm:str='',authorization: str|None=Header(None)):
    actor=admin(authorization)
    from .recycle import move_to_bin, check_confirm
    check_confirm(confirm)
    if not ObjectId.is_valid(media_id): raise HTTPException(400,'Invalid id')
    m=db.media_library.find_one({'_id':ObjectId(media_id)})
    if not m: raise HTTPException(404,'Not found')
    in_use=db.products.find_one({'$or':[{'images':m['url']},{'media.url':m['url']},{'video_url':m['url']},{'promo_image_url':m['url']}]},{'name':1}) or db.categories.find_one({'$or':[{'thumbnail_url':m['url']},{'banner_url':m['url']}]},{'name':1})
    if in_use: raise HTTPException(409,f"In use by {in_use.get('name','an item')}. Remove it there first.")
    hp=db.homepage.find_one({'key':'home'}) or {}
    if m['url'] in str(hp): raise HTTPException(409,'In use on the homepage. Replace it in CMS / Homepage first.')
    # the file stays in S3 until it is deleted forever from the Recycle Bin, so a restore brings back the same URL
    move_to_bin('media','media_library',m,actor,m.get('name') or m['key'].rsplit('/',1)[-1],m['key'])
    return {'ok':True,'in_bin':True}

@app.get('/api/v1/admin/staff')
def list_staff(authorization: str|None=Header(None)):
    super_admin(authorization); return serialize(list(db.staff.find({}, {'password_hash':0}).sort('created_at',-1)))

@app.post('/api/v1/admin/staff')
def create_staff(body: StaffCreate,authorization: str|None=Header(None)):
    actor=super_admin(authorization); email=body.email.lower().strip()
    if db.staff.find_one({'email':email}) or db.admins.find_one({'email':email}): raise HTTPException(409,'Email already exists')
    d=body.model_dump(exclude={'password'}); d.update({'email':email,'password_hash':hash_password(body.password),'must_change_password':True,'created_by':actor['sub'],'created_at':now(),'updated_at':now()})
    r=db.staff.insert_one(d); db.audit_logs.insert_one({'actor_id':actor['sub'],'actor_role':'super_admin','action':'staff_created','target_id':str(r.inserted_id),'metadata':{'email':email,'role':body.role},'created_at':now()})
    return {'id':str(r.inserted_id),'status':'active'}

@app.put('/api/v1/admin/staff/{staff_id}/status')
def staff_status(staff_id:str,payload:dict,authorization: str|None=Header(None)):
    actor=super_admin(authorization); status=payload.get('status')
    if status not in ('active','disabled'): raise HTTPException(400,'Invalid status')
    db.staff.update_one({'_id':ObjectId(staff_id)},{'$set':{'status':status,'updated_at':now()}})
    db.audit_logs.insert_one({'actor_id':actor['sub'],'actor_role':'super_admin','action':'staff_status_changed','target_id':staff_id,'metadata':{'status':status},'created_at':now()}); return {'ok':True}


STAFF_ROLE_SET=('admin','sales','marketing','inventory','support')
@app.put('/api/v1/admin/staff/{staff_id}')
def update_staff(staff_id:str,payload:dict,authorization: str|None=Header(None)):
    actor=super_admin(authorization)
    if not ObjectId.is_valid(staff_id): raise HTTPException(400,'Invalid staff id')
    upd={}
    if 'role' in payload:
        if payload['role'] not in STAFF_ROLE_SET: raise HTTPException(400,'Invalid role')
        upd['role']=payload['role']
    for k in ('name','phone'):
        if isinstance(payload.get(k),str): upd[k]=payload[k].strip()[:120]
    if not upd: raise HTTPException(400,'Nothing to update')
    upd['updated_at']=now()
    r=db.staff.update_one({'_id':ObjectId(staff_id)},{'$set':upd})
    if not r.matched_count: raise HTTPException(404,'Staff not found')
    db.audit_logs.insert_one({'actor_id':actor['sub'],'actor_role':'super_admin','action':'staff_updated','target_id':staff_id,'metadata':{k:v for k,v in upd.items() if k!='updated_at'},'created_at':now()})
    return {'ok':True}

@app.post('/api/v1/admin/staff/{staff_id}/reset-password')
def reset_staff_password(staff_id:str,payload:dict,authorization: str|None=Header(None)):
    actor=super_admin(authorization)
    pw=str(payload.get('password',''))
    if len(pw)<8: raise HTTPException(400,'Temporary password must be at least 8 characters')
    if not ObjectId.is_valid(staff_id): raise HTTPException(400,'Invalid staff id')
    r=db.staff.update_one({'_id':ObjectId(staff_id)},{'$set':{'password_hash':hash_password(pw),'must_change_password':True,'updated_at':now()}})
    if not r.matched_count: raise HTTPException(404,'Staff not found')
    db.audit_logs.insert_one({'actor_id':actor['sub'],'actor_role':'super_admin','action':'staff_password_reset','target_id':staff_id,'created_at':now()})
    return {'ok':True}

@app.post('/api/v1/admin/me/password')
def change_my_password(payload:dict,authorization: str|None=Header(None)):
    ident=admin(authorization)
    cur=str(payload.get('current_password','')); new=str(payload.get('new_password',''))
    if len(new)<10 or not re.search(r'[A-Za-z]',new) or not re.search(r'\d',new): raise HTTPException(400,'New password needs at least 10 characters with letters and numbers')
    coll=db.admins if ident['role']=='super_admin' else db.staff
    me=coll.find_one({'_id':ObjectId(ident['sub'])})
    if not me or not verify_password(cur,me['password_hash']): raise HTTPException(401,'Current password is incorrect')
    coll.update_one({'_id':me['_id']},{'$set':{'password_hash':hash_password(new),'must_change_password':False,'password_changed_at':now()}})
    db.audit_logs.insert_one({'actor_id':ident['sub'],'actor_role':ident['role'],'action':'password_changed','created_at':now()})
    return {'ok':True}

# Customer-owned wishlist: never trust a customer_id supplied by the browser.
def wishlist_customer(authorization):
    identity=require_role(authorization,('customer',))
    return identity['sub']

@app.get('/api/v1/customers/wishlist')
def get_wishlist(authorization: str|None=Header(None)):
    customer_id=wishlist_customer(authorization)
    saved=db.wishlists.find_one({'customer_id':customer_id}) or {}
    ids=saved.get('product_ids',[])
    products=list(db.products.find({'_id':{'$in':[ObjectId(x) for x in ids if ObjectId.is_valid(x)]},'status':'active'}))
    by_id={str(p['_id']):p for p in products}
    return serialize([by_id[x] for x in ids if x in by_id])

@app.put('/api/v1/customers/wishlist/{product_id}')
def add_wishlist(product_id:str,authorization: str|None=Header(None)):
    customer_id=wishlist_customer(authorization)
    if not ObjectId.is_valid(product_id): raise HTTPException(400,'Invalid product ID')
    if not db.products.find_one({'_id':ObjectId(product_id),'status':'active'}): raise HTTPException(404,'Product not found')
    db.wishlists.update_one({'customer_id':customer_id},{'$addToSet':{'product_ids':product_id},'$set':{'updated_at':now()}},upsert=True)
    return {'ok':True}

@app.delete('/api/v1/customers/wishlist/{product_id}')
def remove_wishlist(product_id:str,authorization: str|None=Header(None)):
    customer_id=wishlist_customer(authorization)
    db.wishlists.update_one({'customer_id':customer_id},{'$pull':{'product_ids':product_id},'$set':{'updated_at':now()}})
    return {'ok':True}

@app.get('/api/v1/admin/payments')
def admin_payments(authorization: str|None=Header(None),limit:int=100):
    admin(authorization)
    return serialize(list(db.payment_transactions.find().sort('created_at',-1).limit(min(max(limit,1),500))))

@app.get('/api/v1/admin/categories')
def admin_categories(authorization: str|None=Header(None)):
    admin(authorization)
    rows=list(db.categories.find().sort('order',1))
    counts={x['_id']:x['n'] for x in db.products.aggregate([{'$group':{'_id':'$category_slug','n':{'$sum':1}}}])}
    for c in rows: c['product_count']=counts.get(c['slug'],0)
    return serialize(rows)


@app.get('/api/v1/delivery/quote')
def delivery_quote(district:str, service:str='regular'):
    if service not in ('regular','express'): raise HTTPException(400,'Invalid delivery service')
    cfg=commerce_settings()
    regular=float(cfg.get('dhaka_delivery_charge',70) if district.strip().lower()=='dhaka' else cfg.get('outside_dhaka_delivery_charge',130))
    if service=='regular': return {'service':'regular','available':True,'charge':regular,'currency':'BDT'}
    extra=cfg.get('express_surcharge_by_district',{}).get(district.strip().lower())
    if extra is None: return {'service':'express','available':False,'charge':None,'reason':'Verified express surcharge has not been configured'}
    return {'service':'express','available':True,'regular_charge':regular,'express_surcharge':float(extra),'charge':round(regular+float(extra),2),'currency':'BDT','rate_source':'admin_verified'}

@app.put('/api/v1/admin/dealers/{dealer_id}/discount')
def set_dealer_discount(dealer_id:str,payload:dict,authorization:str|None=Header(None)):
    manager(authorization)
    try: oid=ObjectId(dealer_id)
    except Exception: raise HTTPException(400,'Invalid dealer id')
    if not db.dealers.find_one({'_id':oid}): raise HTTPException(404,'Dealer not found')
    approved=payload.get('approved')
    override=payload.get('override_percent')
    if not isinstance(approved,bool): raise HTTPException(400,'approved must be boolean')
    update={'discount_approved':approved,'updated_at':now()}
    if override is not None:
        if not isinstance(override,(int,float)) or not 0<=override<=100: raise HTTPException(400,'Invalid discount percentage')
        update['discount_override_percent']=float(override)
    else: update['discount_override_percent']=None
    db.dealers.update_one({'_id':oid},{'$set':update})
    return {'ok':True}

@app.get('/api/v1/admin/sms/outbox')
def sms_outbox(authorization:str|None=Header(None)):
    manager(authorization,'marketing')
    return serialize(list(db.sms_outbox.find().sort('created_at',-1).limit(100)))

@app.post('/api/v1/admin/sms/test')
async def sms_test(payload:dict,authorization:str|None=Header(None)):
    """Super admin sends the OTP SMS (sample code 123456) to check BulkSMSBD works (uses 1 SMS credit)."""
    super_admin(authorization)
    if not settings.sms_enabled: raise HTTPException(503,'BULKSMSBD_API_KEY is not set in the backend .env')
    phone=normalize_bd_phone(str(payload.get('phone','')))
    text=otp_message('123456')  # the real OTP template with a sample code
    try: r=await send_sms(phone,text)
    except Exception as e: raise HTTPException(502,f'SMS failed: {str(e)[:200]}')
    return {'ok':True,'provider':'BulkSMSBD','message':text,'sms_parts':sms_parts(text),'response':r}

@app.post('/api/v1/admin/sms/dispatch')
async def dispatch_sms(authorization:str|None=Header(None)):
    manager(authorization,'marketing')
    if not settings.sms_enabled: raise HTTPException(503,'SMS provider is not enabled')
    return sms_dispatch(50)  # the background worker also sends automatically every minute

@app.post('/api/v1/admin/sms/{event_key}/retry')
def retry_sms(event_key:str,authorization:str|None=Header(None)):
    manager(authorization,'marketing')
    r=db.sms_outbox.update_one({'event_key':event_key,'status':'failed'},{'$set':{'status':'retry'}})
    if not r.modified_count: raise HTTPException(404,'Failed message not found')
    return {'ok':True}

@app.get('/api/v1/admin/media/versions')
def media_versions(entity_type:str,entity_id:str,authorization:str|None=Header(None)):
    admin(authorization)
    return serialize(list(db.media_versions.find({'entity_type':entity_type,'entity_id':entity_id}).sort('created_at',-1).limit(50)))

@app.post('/api/v1/admin/media/version')
def record_media_version(payload:dict,authorization:str|None=Header(None)):
    actor=admin(authorization)
    entity_type=payload.get('entity_type'); entity_id=payload.get('entity_id'); key=payload.get('key')
    if entity_type not in ('logo','hero','category','product','banner') or not all(isinstance(x,str) and 0<len(x)<300 for x in (entity_id,key)):
        raise HTTPException(400,'Invalid media version')
    prefix=settings.aws_s3_prefix.strip('/')+'/'
    if not key.startswith(prefix): raise HTTPException(400,'Media key must belong to the configured S3 prefix')
    doc={'entity_type':entity_type,'entity_id':entity_id,'key':key,'url':media_public_url(key),'created_at':now(),'created_by':actor['sub']}
    db.media_versions.insert_one(doc)
    return serialize(doc)
