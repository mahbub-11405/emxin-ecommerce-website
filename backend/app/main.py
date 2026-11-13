from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo import ReturnDocument
from bson import ObjectId
from datetime import datetime, timedelta, timezone
import secrets, re, hashlib, hmac, uuid, mimetypes
from zoneinfo import ZoneInfo
from .config import get_settings
from .db import db, client, ensure_indexes
from .helpers import serialize, now, slugify, next_product_codes
from .security import hash_password, verify_password, create_token, require_role, decode_token
from .schemas import *
from .pricing import calculate
from .integrations import PayStationClient, NishchitClient, SteadfastClient, PathaoClient, IntegrationNotConfigured
from .admin_ext import router as v2_router, release_stock
from .media_optimize import queue_video

settings=get_settings()
app=FastAPI(title='EMXIN REST API',version='1.0.0',openapi_url='/api/v1/openapi.json',docs_url='/docs')
app.add_middleware(CORSMiddleware,allow_origins=settings.origins,allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
app.include_router(v2_router)

@app.on_event('startup')
def startup():
    client.admin.command('ping'); ensure_indexes()
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

@app.post('/api/v1/auth/otp/request')
async def request_otp(body: OTPRequest):
    phone=normalize_bd_phone(body.phone); now_dt=now()
    if body.purpose=='login' and not db.customers.find_one({'phone':phone},{'_id':1}):
        raise HTTPException(404,'No account found for this number. Please register first.')
    if body.purpose=='customer_register' and db.customers.find_one({'phone':phone},{'_id':1}):
        raise HTTPException(409,'This number is already registered. Please log in.')
    previous=db.otp_challenges.find_one({'phone':phone,'purpose':body.purpose},sort=[('created_at',-1)])
    if previous and (now_dt-previous['created_at']).total_seconds()<settings.otp_resend_seconds: raise HTTPException(429,'Please wait before requesting another OTP')
    if settings.app_env == 'production' and not settings.nishchit_enabled:
        raise HTTPException(503,'SMS verification provider must be enabled in production')
    code=f'{secrets.randbelow(1000000):06d}'; challenge_id=str(uuid.uuid4())
    expires=now_dt+timedelta(seconds=settings.otp_expire_seconds)
    doc={'challenge_id':challenge_id,'phone':phone,'purpose':body.purpose,'code_hash':otp_hash(phone,body.purpose,code),'attempts':0,'verified':False,'created_at':now_dt,'expires_at':expires}
    db.otp_challenges.insert_one(doc)
    sms_result=None
    if settings.nishchit_enabled:
        text=(f'আপনার EMXIN যাচাইকরণ কোড: {code}. কোডটি {settings.otp_expire_seconds//60} মিনিট কার্যকর।' if body.language=='bn' else f'Your EMXIN verification code is {code}. It expires in {settings.otp_expire_seconds//60} minutes.')
        try: sms_result=await NishchitClient().send(phone,text,f'otp-{challenge_id}',challenge_id)
        except (IntegrationNotConfigured, Exception) as e:
            db.otp_challenges.delete_one({'challenge_id':challenge_id})
            raise HTTPException(503,'SMS delivery failed; please retry later')
    response={'challenge_id':challenge_id,'expires_in':settings.otp_expire_seconds,'sms':sms_result}
    if settings.otp_expose_code_in_test and (settings.app_env!='production' or settings.nishchit_is_test): response['test_code']=code
    return response

@app.post('/api/v1/auth/otp/verify')
def verify_otp(body: OTPVerify):
    phone=normalize_bd_phone(body.phone); c=db.otp_challenges.find_one({'phone':phone,'purpose':body.purpose},sort=[('created_at',-1)])
    if not c or c.get('verified') or c['expires_at']<now(): raise HTTPException(400,'OTP expired or invalid')
    if c.get('attempts',0)>=settings.otp_max_attempts: raise HTTPException(429,'Too many attempts')
    if not hmac.compare_digest(c['code_hash'],otp_hash(phone,body.purpose,body.code)):
        db.otp_challenges.update_one({'_id':c['_id']},{'$inc':{'attempts':1}}); raise HTTPException(400,'Incorrect OTP')
    verification_id=str(uuid.uuid4())
    db.otp_challenges.update_one({'_id':c['_id']},{'$set':{'verified':True,'verified_at':now(),'verification_id':verification_id}})
    return {'verified':True,'verification_id':verification_id}

def consume_phone_verification(phone,purpose,verification_id):
    if not verification_id: return False
    c=db.otp_challenges.find_one({'phone':normalize_bd_phone(phone),'purpose':purpose,'verification_id':verification_id,'verified':True,'consumed':{'$ne':True}})
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
@app.get('/api/v1/home')
def home():
    return {'homepage':serialize(db.homepage.find_one({'key':'home'},{'_id':0})),'settings':serialize(db.settings.find_one({'key':'commerce'},{'_id':0})),'categories':serialize(list(db.categories.find({'visible':True}).sort('order',1))),'featured':serialize(with_names(list(db.products.find({'status':'active','featured':True}).sort([('sort_order',1),('created_at',-1)]).limit(8)))),'new_collection':serialize(with_names(list(db.products.find({'status':'active','new_collection':True}).sort([('sort_order',1),('created_at',-1)]).limit(8)))),'products':serialize(with_names(list(db.products.find({'status':'active'}).sort([('sort_order',1),('created_at',-1)]).limit(12))))}

@app.get('/api/v1/site-content')
def site_content():
    home=db.homepage.find_one({'key':'home'},{'_id':0}) or {}
    cfg=db.settings.find_one({'key':'commerce'},{'_id':0,'dealer_tiers':1,'bulk_threshold_qty':1,'digital_payment_discount_percent':1}) or {}
    return {k:home.get(k,{}) for k in ('branding','links','trust','policies','dealer_benefits','announcement','footer','seo')}|{'dealer_tiers':cfg.get('dealer_tiers') or [5,8,12,15],'bulk_threshold_qty':cfg.get('bulk_threshold_qty',20),'digital_payment_discount_percent':cfg.get('digital_payment_discount_percent',2)}

@app.get('/api/v1/categories')
def categories(): return serialize(list(db.categories.find({'visible':True}).sort('order',1)))
@app.get('/api/v1/brands')
def brands(category: str|None=None):
    q={'visible':True}
    if category:
        used=db.products.distinct('brand_slug',{'category_slug':category,'status':'active'})
        q['slug']={'$in':used}
    return serialize(list(db.brands.find(q).sort('order',1)))

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
    if q:f['$or']=[{'name':{'$regex':re.escape(q),'$options':'i'}},{'features':{'$elemMatch':{'$regex':re.escape(q),'$options':'i'}}},{'model':{'$regex':re.escape(q),'$options':'i'}}]
    order={'price_asc':[('price',1)],'price_desc':[('price',-1)],'newest':[('created_at',-1)],'rating':[('rating',-1),('review_count',-1)],'popular':[('sold_count',-1)]}.get(sort,[('sort_order',1),('stock',-1),('created_at',-1)])
    return serialize(with_names(list(db.products.find(f).sort(order).limit(min(limit,100)))))

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
    if settings.nishchit_enabled and not consume_phone_verification(phone,'customer_register',body.otp_verification_id): raise HTTPException(400,'Phone OTP verification required')
    if db.customers.find_one({'$or':[{'email':email},{'phone':phone}]}): raise HTTPException(409,'Email or phone already registered')
    doc=body.model_dump(exclude={'password'}); doc.update({'email':email,'phone':phone,'password_hash':hash_password(body.password),'account_type':'customer','lead_status':'New Lead','lead_priority':'Cold','total_orders':0,'total_purchase':0.0,'created_at':now(),'last_login_at':None,'last_active_at':now(),'assigned_sales_person':None,'sales_notes':[],'next_followup_at':None})
    r=db.customers.insert_one(doc)
    return {'access_token':create_token(str(r.inserted_id),'customer'),'customer':serialize({**doc,'_id':r.inserted_id,'password_hash':None})}

@app.post('/api/v1/customers/login')
def customer_login(body: Login):
    c=db.customers.find_one({'email':body.email.lower().strip()})
    if not c or not verify_password(body.password,c['password_hash']): raise HTTPException(401,'Invalid login')
    db.customers.update_one({'_id':c['_id']},{'$set':{'last_login_at':now(),'last_active_at':now()}})
    clean={k:v for k,v in c.items() if k!='password_hash'}
    return {'access_token':create_token(str(c['_id']),'customer'),'customer':serialize(clean)}

class PhoneOTPLogin(BaseModel):
    phone: str
    verification_id: str
    name: str = ''

@app.post('/api/v1/customers/phone-login')
def customer_phone_login(body: PhoneOTPLogin):
    """Passwordless customer login; requires a consumed, verified OTP."""
    phone=normalize_bd_phone(body.phone)
    c=db.customers.find_one({'phone':phone})
    if not c: raise HTTPException(404,'No account found for this number. Please register first.')
    if not consume_phone_verification(phone,'login',body.verification_id):
        raise HTTPException(401,'Valid phone OTP verification required')
    db.customers.update_one({'_id':c['_id']},{'$set':{'last_login_at':now(),'last_active_at':now()}})
    return {'access_token':create_token(str(c['_id']),'customer'),
            'customer':serialize({k:v for k,v in c.items() if k!='password_hash'})}

@app.post('/api/v1/customers/register-phone')
def customer_register_phone(body: PhoneRegister):
    """Mobile-number-only registration, verified by OTP (purpose=customer_register)."""
    phone=normalize_bd_phone(body.phone)
    if db.customers.find_one({'phone':phone}): raise HTTPException(409,'This number is already registered. Please log in.')
    email=body.email.lower().strip() if body.email else None
    if email and db.customers.find_one({'email':email}): raise HTTPException(409,'This email is already used by another account.')
    if not consume_phone_verification(phone,'customer_register',body.verification_id): raise HTTPException(401,'Valid phone OTP verification required')
    doc={'name':body.name.strip(),'phone':phone,'phone_verified':True,'district':body.district,'address':body.address,'account_type':'customer','lead_status':'New Lead','lead_priority':'Cold','total_orders':0,'total_purchase':0.0,'created_at':now(),'last_login_at':now(),'last_active_at':now(),'assigned_sales_person':None,'sales_notes':[],'next_followup_at':None}
    if email: doc['email']=email
    r=db.customers.insert_one(doc)
    return {'access_token':create_token(str(r.inserted_id),'customer'),'customer':serialize({**doc,'_id':r.inserted_id})}

@app.put('/api/v1/customers/me')
def customer_update_me(payload: dict, authorization: str|None=Header(None)):
    auth=require_role(authorization,('customer',))
    upd={k:str(v).strip()[:300] for k,v in payload.items() if k in ('name','address','district') and v is not None}
    if payload.get('email'):
        email=str(payload['email']).lower().strip()
        if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+',email): raise HTTPException(400,'Invalid email')
        if db.customers.find_one({'email':email,'_id':{'$ne':ObjectId(auth['sub'])}}): raise HTTPException(409,'Email already in use')
        upd['email']=email
    if upd: db.customers.update_one({'_id':ObjectId(auth['sub'])},{'$set':upd})
    return {'ok':True}

@app.get('/api/v1/customers/me')
def customer_me(authorization: str|None=Header(None)):
    auth=require_role(authorization,('customer',)); c=db.customers.find_one({'_id':ObjectId(auth['sub'])},{'password_hash':0})
    if not c: raise HTTPException(404,'Customer not found')
    orders=list(db.orders.find({'customer_id':str(c['_id'])}).sort('created_at',-1).limit(100))
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
    if settings.nishchit_enabled and not consume_phone_verification(body.phone,'dealer_register',body.otp_verification_id): raise HTTPException(400,'Phone OTP verification required')
    phone=normalize_bd_phone(body.phone)
    if db.dealers.find_one({'phone':phone}): raise HTTPException(409,'Phone already registered')
    if not body.terms_accepted: raise HTTPException(400,'Please read and accept the dealer order terms')
    doc=body.model_dump(exclude={'password'}); doc['phone']=phone; doc['terms_accepted_at']=now(); doc.update({'password_hash':hash_password(body.password),'status':'Pending','discount_percent':settings.bulk_discount_percent,'created_at':now(),'total_orders':0,'total_purchase':0})
    r=db.dealers.insert_one(doc)
    message=('EMXIN Technologies: আপনার ডিলার আবেদন সফলভাবে জমা হয়েছে। ধন্যবাদ।' if body.preferred_language=='bn' else 'EMXIN Technologies: Your dealer application has been submitted successfully. Thank you.')
    db.sms_outbox.update_one({'event_key':'dealer-applied-'+str(r.inserted_id)},{'$setOnInsert':{'event_key':'dealer-applied-'+str(r.inserted_id),'phone':phone,'message':message,'status':'pending','created_at':now()}},upsert=True)
    return {'dealer_id':str(r.inserted_id),'status':'Pending','sms_queued':True}

@app.post('/api/v1/dealers/login')
def dealer_login(body: Login):
    d=db.dealers.find_one({'email':body.email.lower()})
    if not d or not verify_password(body.password,d['password_hash']): raise HTTPException(401,'Invalid login')
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
    if coupon and coupon.get('min_order') and sum(float(pmap[i.product_id].get('sale_price') or pmap[i.product_id]['price'])*i.quantity for i in body.items)<float(coupon['min_order']): raise HTTPException(400,f"Minimum order ৳{coupon['min_order']} required for this coupon")
    dealer=db.dealers.find_one({'phone':normalize_bd_phone(body.phone),'status':'Active'}) if body.dealer_opt_in else None
    cfg=commerce_settings().copy()
    if dealer and sum(i.quantity for i in body.items)>=20:
        completed=db.orders.count_documents({'dealer_id':str(dealer['_id']),'order_status':{'$in':['Delivered','Completed']}})
        tiers=cfg.get('dealer_tiers') or [5,8,12,15]
        tier=tiers[min(completed,len(tiers)-1)]
        cfg['bulk_discount_percent']=float(dealer.get('discount_override_percent') if dealer.get('discount_override_percent') is not None else tier) if dealer.get('discount_approved',False) else 0.0
    else:
        cfg['bulk_discount_percent']=0.0
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
        if body.payment_method!='paystation': raise HTTPException(400,f"Bulk orders ({int(cfg.get('bulk_threshold_qty',settings.bulk_threshold_qty))}+ pcs) need an online advance payment via PayStation")
        payment_status='Pending Advance Payment'
    else:
        payment_status='Unpaid' if body.payment_method in ('cod','bank') else 'Pending Payment'
    items=[]
    for i in body.items:
        p=pmap[i.product_id]
        items.append({'product_id':i.product_id,'name':p['name'],'slug':p['slug'],'quantity':i.quantity,'frame_color':i.frame_color,'unit_price':float(p.get('sale_price') or p['price'])})
    customer=buyer
    doc={'order_id':order_id,'customer_name':body.customer_name,'phone':normalize_bd_phone(body.phone),'timeline':[{'at':now(),'order_status':status,'payment_status':payment_status,'note':'Order placed on website','role':'customer'}],'email':body.email,'customer_id':str(customer['_id']) if customer else None,'address':body.address,'district':body.district,'items':items,'pricing':pricing,'payment_method':body.payment_method,'payment_status':payment_status,'order_status':status,'coupon_code':coupon.get('code') if coupon else None,'dealer_opt_in':body.dealer_opt_in,'shop_name':body.shop_name,'dealer_id':str(dealer['_id']) if dealer else None,'dealer_discount_approved':bool(dealer and dealer.get('discount_approved')), 'courier':None,'courier_data':None,'courier_billing_mode':('deduct_from_cod_collection' if pricing.get('cod_due',0)>0 else 'merchant_periodic_bill'),'created_at':now(),'updated_at':now()}
    # Reserve stock immediately for confirmed website intent; cancelled orders can release via admin action.
    for i in body.items: db.products.update_one({'_id':ObjectId(i.product_id)},{'$inc':{'stock':-i.quantity,'reserved':i.quantity}})
    db.orders.insert_one(doc)
    if customer:
        db.customers.update_one({'_id':customer['_id']},{'$inc':{'total_orders':1,'total_purchase':pricing['grand_total']},'$set':{'lead_status':'Converted','lead_priority':'Hot','last_active_at':now()}})
    db.customers.update_one({'_id':buyer['_id'],'address':{'$in':[None,'']}},{'$set':{'address':body.address,'district':body.district}})
    db.ledger.insert_one({'order_id':order_id,'type':'order_created','amount':pricing['grand_total'],'payment_method':body.payment_method,'created_at':now()})
    response={'order_id':order_id,'status':status,'payment_status':payment_status,'pricing':pricing}
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
    if o.get('payment_method')!='paystation':
        # customer switches a COD order to digital: re-price with the 2% digital discount
        cfg=commerce_settings()
        items=[{'product_id':i['product_id'],'quantity':i['quantity']} for i in o['items']]
        pmap={str(p['_id']):p for p in db.products.find({'_id':{'$in':[ObjectId(i['product_id']) for i in o['items']]}})}
        prev=o.get('pricing') or {}
        cfg['bulk_discount_percent']=(prev.get('bulk_discount',0)/prev['subtotal']*100) if prev.get('subtotal') else 0
        coupon=db.coupons.find_one({'code':o.get('coupon_code')}) if o.get('coupon_code') else None
        pricing=calculate(items,pmap,o.get('district',''),'paystation',coupon,cfg)
        db.orders.update_one({'_id':o['_id']},{'$set':{'payment_method':'paystation','pricing':pricing,'payment_status':'Pending Advance Payment' if pricing['is_bulk'] else 'Pending Payment','updated_at':now()},'$push':{'timeline':{'at':now(),'note':'Customer switched to digital payment','role':'customer'}}})
        o=db.orders.find_one({'_id':o['_id']})
    return await start_paystation(o)

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
    o=db.orders.find_one({'order_id':order_id.strip().upper(),'phone':{'$in':[norm,phone]}})
    if not o: raise HTTPException(404,'Order not found')
    keep={k:o.get(k) for k in ['order_id','order_status','payment_status','pricing','courier','created_at','updated_at','items','district']}
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
    return {'access_token':create_token(str(a['_id']),role),'role':role,'name':a.get('name',''),'must_change_password':bool(a.get('must_change_password'))}

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
    for c in docs:
        c['recent_activity']=serialize(list(db.analytics_events.find({'customer_id':str(c['_id'])}).sort('created_at',-1).limit(8)))
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
    db.orders.update_one({'_id':o['_id']},{'$set':{'order_status':'Confirmed','confirmed_at':now(),'updated_at':now()},'$push':{'timeline':{'at':now(),'order_status':'Confirmed','note':'Customer confirmed by phone'}}})
    # Business rule: after EMXIN calls the customer and Admin confirms, create the default
    # Steadfast consignment automatically. Nothing is sent to courier before this click.
    if settings.courier_default=='steadfast' and settings.steadfast_enabled:
        refreshed=db.orders.find_one({'_id':o['_id']})
        try:
            data=await SteadfastClient().create_order(refreshed)
            db.orders.update_one({'_id':o['_id']},{'$set':{'order_status':'Sent to Courier','courier':'steadfast','courier_data':data,'courier_created_at':now(),'updated_at':now()},'$push':{'timeline':{'at':now(),'order_status':'Sent to Courier','note':'Steadfast consignment created'}}})
            db.ledger.insert_one({'order_id':order_id,'type':'courier_created','amount':0,'payment_method':refreshed.get('payment_method'),'courier':'steadfast','cod_amount':refreshed.get('pricing',{}).get('cod_due',0),'courier_billing_mode':refreshed.get('courier_billing_mode'),'created_at':now()})
        except IntegrationNotConfigured:
            pass
    return serialize(db.orders.find_one({'_id':o['_id']}))

@app.post('/api/v1/admin/orders/{order_id}/cancel')
def cancel_order(order_id:str,authorization: str|None=Header(None)):
    require_role(authorization,ORDER_WRITE); o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    if o.get('order_status') in ('Delivered','Completed'): raise HTTPException(409,'Delivered orders must be marked Returned, not cancelled')
    if o.get('order_status')!='Cancelled':
        release_stock(o)
        db.orders.update_one({'order_id':order_id},{'$set':{'order_status':'Cancelled','updated_at':now()},'$push':{'timeline':{'at':now(),'order_status':'Cancelled','note':'Cancelled by admin'}}})
    return {'ok':True}

@app.post('/api/v1/admin/orders/{order_id}/send-courier')
async def send_courier(order_id:str,courier:str='steadfast',authorization: str|None=Header(None)):
    require_role(authorization,ORDER_WRITE); o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    if o['order_status'] not in ('Confirmed','Approved'): raise HTTPException(409,'Confirm the customer/order first')
    try:
        if courier=='steadfast': data=await SteadfastClient().create_order(o)
        elif courier=='pathao': data=await PathaoClient().create_order(o)
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
    admin(authorization); return serialize(list(db.dealers.find({}, {'password_hash':0}).sort('created_at',-1)))

@app.post('/api/v1/admin/dealers/{dealer_id}/approve')
def approve_dealer(dealer_id:str,authorization: str|None=Header(None)):
    manager(authorization)
    try: oid=ObjectId(dealer_id)
    except Exception: raise HTTPException(400,'Invalid dealer id')
    d=db.dealers.find_one({'_id':oid})
    if not d: raise HTTPException(404,'Dealer not found')
    db.dealers.update_one({'_id':oid},{'$set':{'status':'Active','discount_approved':True,'updated_at':now()}})
    if d.get('status')!='Active':
        message=('EMXIN Technologies: আপনার ডিলার আবেদন অনুমোদিত হয়েছে।' if d.get('preferred_language')=='bn' else 'EMXIN Technologies: Your dealer application has been approved.')
        db.sms_outbox.update_one({'event_key':'dealer-approved-'+dealer_id},{'$setOnInsert':{'event_key':'dealer-approved-'+dealer_id,'phone':d['phone'],'message':message,'status':'pending','created_at':now()}},upsert=True)
    return {'ok':True,'sms_queued':d.get('status')!='Active'}

@app.get('/api/v1/admin/products')
def admin_products(authorization: str|None=Header(None)):
    admin(authorization); return serialize(list(db.products.find().sort('created_at',-1)))

@app.get('/api/v1/admin/product-next-codes')
def product_next_codes(authorization: str|None=Header(None)):
    require_role(authorization,CATALOG); return next_product_codes(db)

@app.post('/api/v1/admin/products')
def create_product(body:ProductInput,authorization: str|None=Header(None)):
    require_role(authorization,CATALOG); d=body.model_dump(); d['slug']=slugify(d.get('slug') or d['name'])
    if db.products.find_one({'slug':d['slug']}): raise HTTPException(409,'A product with this slug already exists')
    codes=next_product_codes(db)
    if not d.get('sku'): d['sku']=codes['sku']
    if not d.get('compare_note'): d['compare_note']=codes['compare_note']
    d.update({'reserved':0,'sold_count':0,'rating':0,'review_count':0,'created_at':now(),'updated_at':now()}); r=db.products.insert_one(d); return {'id':str(r.inserted_id),'slug':d['slug']}

@app.put('/api/v1/admin/products/{product_id}')
def update_product(product_id:str,body:ProductInput,authorization: str|None=Header(None)):
    require_role(authorization,CATALOG); d=body.model_dump(); d['slug']=slugify(d.get('slug') or d['name']); d['updated_at']=now()
    if not ObjectId.is_valid(product_id): raise HTTPException(400,'Invalid product id')
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
    allowed={'hero','promo','sections','branding','links','policies','trust','dealer_benefits','footer','coming_soon','announcement','banner','category_section','featured_section','seo','hidden_sections','smart_section'}
    if set(payload)-allowed-{'key','updated_at','_id'}: raise HTTPException(400,'Unexpected homepage fields')
    if 'sections' in payload and (not isinstance(payload['sections'],list) or len(payload['sections'])>30 or any(not isinstance(x,str) for x in payload['sections'])):
        raise HTTPException(400,'Invalid homepage sections')
    current=db.homepage.find_one({'key':'home'},{'_id':0}) or {}
    db.cms_versions.insert_one({'snapshot':current,'created_at':now(),'action':'before_publish'})
    cleaned={k:v for k,v in payload.items() if k in allowed}
    cleaned['updated_at']=now()
    db.homepage.update_one({'key':'home'},{'$set':cleaned},upsert=True)
    return {'ok':True}


@app.put('/api/v1/admin/settings/commerce')
def update_commerce(payload:dict,authorization: str|None=Header(None)):
    manager(authorization)
    permitted={'dhaka_delivery_charge','outside_dhaka_delivery_charge','estimated_shipping_from_qty','extra_shipping_per_kg','bulk_threshold_qty','bulk_discount_percent','bulk_advance_percent','digital_payment_discount_percent','payment_accounts','return_label','express_surcharge_by_district','dealer_tiers'}
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
def ledger(authorization: str|None=Header(None)):
    admin(authorization); return serialize(list(db.ledger.find().sort('created_at',-1).limit(500)))


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
    for c in db.categories.find({},{'slug':1,'thumbnail_url':1}).sort('order',1): claim(c.get('thumbnail_url'),f"category/{c['slug']}")
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
    for c in db.categories.find({},{'slug':1,'name':1,'thumbnail_url':1}):
        add(c.get('thumbnail_url'),{'kind':'category','id':c['slug'],'label':c.get('name',''),'where':'Category tile'})
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
def media_library_delete(media_id:str,authorization: str|None=Header(None)):
    actor=admin(authorization)
    if not ObjectId.is_valid(media_id): raise HTTPException(400,'Invalid id')
    m=db.media_library.find_one({'_id':ObjectId(media_id)})
    if not m: raise HTTPException(404,'Not found')
    in_use=db.products.find_one({'$or':[{'images':m['url']},{'media.url':m['url']},{'video_url':m['url']},{'promo_image_url':m['url']}]},{'name':1}) or db.categories.find_one({'thumbnail_url':m['url']},{'name':1})
    if in_use: raise HTTPException(409,f"In use by {in_use.get('name','an item')}. Remove it there first.")
    hp=db.homepage.find_one({'key':'home'}) or {}
    if m['url'] in str(hp): raise HTTPException(409,'In use on the homepage. Replace it in CMS / Homepage first.')
    try: s3_client().delete_object(Bucket=settings.aws_s3_bucket,Key=m['key'])
    except HTTPException: pass
    except Exception as e: raise HTTPException(502,f'S3 delete failed: {str(e)[:120]}')
    db.media_library.delete_one({'_id':m['_id']})
    db.audit_logs.insert_one({'actor_id':actor['sub'],'actor_role':actor.get('role'),'action':'media_deleted','target_id':m['key'],'created_at':now()})
    return {'ok':True}

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

@app.post('/api/v1/admin/sms/dispatch')
async def dispatch_sms(authorization:str|None=Header(None)):
    manager(authorization,'marketing')
    if not settings.nishchit_enabled: raise HTTPException(503,'SMS provider is not enabled')
    sent=0; failed=0
    for _ in range(20):
        item=db.sms_outbox.find_one_and_update({'status':{'$in':['pending','retry']}}, {'$set':{'status':'sending','last_attempt_at':now()}},return_document=ReturnDocument.AFTER)
        if not item: break
        try:
            await NishchitClient().send(item['phone'],item['message'],item['event_key'])
            db.sms_outbox.update_one({'_id':item['_id']},{'$set':{'status':'sent','sent_at':now()}}); sent+=1
        except Exception as exc:
            db.sms_outbox.update_one({'_id':item['_id']},{'$set':{'status':'failed','error':str(exc)[:250]}}); failed+=1
    return {'sent':sent,'failed':failed}

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
