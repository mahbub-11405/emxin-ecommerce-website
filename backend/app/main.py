from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo import ReturnDocument
from bson import ObjectId
from datetime import datetime, timedelta, timezone
import secrets, re, hashlib, hmac, uuid, mimetypes
from zoneinfo import ZoneInfo
from .config import get_settings
from .db import db, client, ensure_indexes
from .helpers import serialize, now, slugify
from .security import hash_password, verify_password, create_token, require_role, decode_token
from .schemas import *
from .pricing import calculate
from .integrations import PayStationClient, NishchitClient, SteadfastClient, PathaoClient, IntegrationNotConfigured

settings=get_settings()
app=FastAPI(title='EMXIN REST API',version='1.0.0',openapi_url='/api/v1/openapi.json',docs_url='/docs')
app.add_middleware(CORSMiddleware,allow_origins=settings.origins,allow_credentials=True,allow_methods=['*'],allow_headers=['*'])

@app.on_event('startup')
def startup():
    client.admin.command('ping'); ensure_indexes()
    if not db.admins.find_one({'email':settings.initial_admin_email.lower()}):
        db.admins.insert_one({'email':settings.initial_admin_email.lower(),'password_hash':hash_password(settings.initial_admin_password),'role':'super_admin','created_at':now()})
    if not db.settings.find_one({'key':'commerce'}):
        db.settings.insert_one({'key':'commerce','dhaka_delivery_charge':settings.dhaka_delivery_charge,'outside_dhaka_delivery_charge':settings.outside_dhaka_delivery_charge,'estimated_shipping_from_qty':settings.estimated_shipping_from_qty,'extra_shipping_per_kg':settings.extra_shipping_per_kg,'bulk_threshold_qty':settings.bulk_threshold_qty,'bulk_discount_percent':settings.bulk_discount_percent,'bulk_advance_percent':settings.bulk_advance_percent,'digital_payment_discount_percent':settings.digital_payment_discount_percent,'payment_accounts':{'bkash':{'enabled':bool(settings.payment_bkash_number),'number':settings.payment_bkash_number,'account_type':settings.payment_bkash_account_type},'nagad':{'enabled':bool(settings.payment_nagad_number),'number':settings.payment_nagad_number,'account_type':settings.payment_nagad_account_type},'bank':{'enabled':bool(settings.payment_bank_account_number),'bank_name':settings.payment_bank_name,'account_name':settings.payment_bank_account_name,'account_number':settings.payment_bank_account_number,'branch':settings.payment_bank_branch,'routing_number':settings.payment_bank_routing_number}},'return_label':'Conditional Return','updated_at':now()})
    if not db.homepage.find_one({'key':'home'}):
        db.homepage.insert_one({'key':'home','hero':{'title':'Smart Gadgets. Smarter Living.','title_bn':'স্মার্ট গ্যাজেটস। স্মার্টার লিভিং।','subtitle':'Discover smart eyewear, sunglasses and frames.','subtitle_bn':'স্মার্ট গ্লাস, সানগ্লাস ও ফ্রেম এক জায়গায়।','cta':'Shop Now','cta_bn':'শপ করুন','image':''},'sections':['new_collection','categories','featured','promo','best_sellers','trust'],'promo':{'title':'New Collection','subtitle':'Fresh arrivals from EMXIN','image':'','cta':'Explore Collection'},'updated_at':now()})

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
    previous=db.otp_challenges.find_one({'phone':phone,'purpose':body.purpose},sort=[('created_at',-1)])
    if previous and (now_dt-previous['created_at']).total_seconds()<settings.otp_resend_seconds: raise HTTPException(429,'Please wait before requesting another OTP')
    code=f'{secrets.randbelow(1000000):06d}'; challenge_id=str(uuid.uuid4())
    expires=now_dt+timedelta(seconds=settings.otp_expire_seconds)
    doc={'challenge_id':challenge_id,'phone':phone,'purpose':body.purpose,'code_hash':otp_hash(phone,body.purpose,code),'attempts':0,'verified':False,'created_at':now_dt,'expires_at':expires}
    db.otp_challenges.insert_one(doc)
    sms_result=None
    if settings.nishchit_enabled:
        text=(f'আপনার EMXIN যাচাইকরণ কোড: {code}. কোডটি {settings.otp_expire_seconds//60} মিনিট কার্যকর।' if body.language=='bn' else f'Your EMXIN verification code is {code}. It expires in {settings.otp_expire_seconds//60} minutes.')
        try: sms_result=await NishchitClient().send(phone,text,f'otp-{challenge_id}',challenge_id)
        except IntegrationNotConfigured as e: raise HTTPException(503,str(e))
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
    db.otp_challenges.update_one({'_id':c['_id']},{'$set':{'consumed':True,'consumed_at':now()}}); return True

# ---------- Media / S3 ----------
def s3_client():
    if not settings.aws_s3_bucket: raise HTTPException(503,'S3 bucket is not configured')
    import boto3
    return boto3.client('s3',region_name=settings.aws_region,aws_access_key_id=settings.aws_access_key_id or None,aws_secret_access_key=settings.aws_secret_access_key or None)

def media_public_url(key):
    base=(settings.aws_cdn_base_url or '').rstrip('/')
    return f'{base}/{key}' if base else f'https://{settings.aws_s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}'

# ---------- Public CMS / catalog ----------
@app.get('/api/v1/home')
def home():
    return {'homepage':serialize(db.homepage.find_one({'key':'home'},{'_id':0})),'settings':serialize(db.settings.find_one({'key':'commerce'},{'_id':0})),'categories':serialize(list(db.categories.find({'visible':True}).sort('order',1))),'featured':serialize(list(db.products.find({'status':'active','featured':True}).limit(8))),'new_collection':serialize(list(db.products.find({'status':'active','new_collection':True}).limit(8)))}

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
def products(category: str|None=None,brand: str|None=None,q: str|None=None,limit:int=50):
    f={'status':'active'}
    if category:f['category_slug']=category
    if brand:f['brand_slug']=brand
    if q:f['$or']=[{'name':{'$regex':re.escape(q),'$options':'i'}},{'features':{'$elemMatch':{'$regex':re.escape(q),'$options':'i'}}}]
    return serialize(list(db.products.find(f).sort([('stock',-1),('created_at',-1)]).limit(min(limit,100))))

@app.get('/api/v1/products/{slug}')
def product(slug:str):
    p=db.products.find_one({'slug':slug,'status':'active'})
    if not p: raise HTTPException(404,'Product not found')
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
    p=db.products.find_one({'_id':ObjectId(body.product_id)})
    if not p: raise HTTPException(404,'Product not found')
    doc=body.model_dump(); doc.update({'product_name':p['name'],'status':'New','created_at':now()})
    result=db.quantity_requests.insert_one(doc)
    if body.dealer_opt_in:
        db.dealer_leads.update_one({'phone':body.phone},{'$set':{'name':body.name,'shop_name':body.shop_name,'phone':body.phone,'email':body.email,'status':'Pending','source':'quantity_request','updated_at':now()}},upsert=True)
    return {'request_id':str(result.inserted_id),'status':'New'}

@app.post('/api/v1/dealers/apply')
def dealer_apply(body: DealerApply):
    if settings.nishchit_enabled and not consume_phone_verification(body.phone,'dealer_register',body.otp_verification_id): raise HTTPException(400,'Phone OTP verification required')
    phone=normalize_bd_phone(body.phone)
    if db.dealers.find_one({'phone':phone}): raise HTTPException(409,'Phone already registered')
    doc=body.model_dump(exclude={'password'}); doc['phone']=phone; doc.update({'password_hash':hash_password(body.password),'status':'Pending','discount_percent':settings.bulk_discount_percent,'created_at':now(),'total_orders':0,'total_purchase':0})
    r=db.dealers.insert_one(doc); return {'dealer_id':str(r.inserted_id),'status':'Pending'}

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
async def create_order(body: OrderCreate):
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
    pricing=calculate([x.model_dump() for x in body.items],pmap,body.district,body.payment_method,coupon,commerce_settings())
    if (pricing['is_bulk'] or body.dealer_opt_in) and not body.shop_name:
        raise HTTPException(400,'Shop / Business Name is required for bulk/dealer orders')
    order_id='EMX-'+now().strftime('%y%m%d')+'-'+secrets.token_hex(3).upper()
    dealer=None
    if body.dealer_opt_in and body.shop_name:
        dealer=db.dealers.find_one({'phone':body.phone})
        if not dealer:
            db.dealer_leads.update_one({'phone':body.phone},{'$set':{'name':body.customer_name,'shop_name':body.shop_name,'phone':body.phone,'email':body.email,'status':'Pending','source':'checkout','updated_at':now()}},upsert=True)
    status='Pending Confirmation'
    if pricing['is_bulk']:
        payment_status='Pending Advance Payment' if body.payment_method=='paystation' else ('Awaiting Advance Verification' if body.payment_method=='bank' else 'Advance Required')
    else:
        payment_status='Unpaid' if body.payment_method in ('cod','bank') else 'Pending Payment'
    items=[]
    for i in body.items:
        p=pmap[i.product_id]
        items.append({'product_id':i.product_id,'name':p['name'],'slug':p['slug'],'quantity':i.quantity,'frame_color':i.frame_color,'unit_price':float(p.get('sale_price') or p['price'])})
    customer=db.customers.find_one({'$or':[{'phone':body.phone},{'email':body.email.lower() if body.email else '__none__'}]})
    doc={'order_id':order_id,'customer_name':body.customer_name,'phone':body.phone,'email':body.email,'customer_id':str(customer['_id']) if customer else None,'address':body.address,'district':body.district,'items':items,'pricing':pricing,'payment_method':body.payment_method,'payment_status':payment_status,'order_status':status,'coupon_code':coupon.get('code') if coupon else None,'dealer_opt_in':body.dealer_opt_in,'shop_name':body.shop_name,'dealer_id':str(dealer['_id']) if dealer else None,'courier':None,'courier_data':None,'courier_billing_mode':('deduct_from_cod_collection' if pricing.get('cod_due',0)>0 else 'merchant_periodic_bill'),'created_at':now(),'updated_at':now()}
    # Reserve stock immediately for confirmed website intent; cancelled orders can release via admin action.
    for i in body.items: db.products.update_one({'_id':ObjectId(i.product_id)},{'$inc':{'stock':-i.quantity,'reserved':i.quantity}})
    db.orders.insert_one(doc)
    if customer:
        db.customers.update_one({'_id':customer['_id']},{'$inc':{'total_orders':1,'total_purchase':pricing['grand_total']},'$set':{'lead_status':'Converted','lead_priority':'Hot','last_active_at':now()}})
    db.ledger.insert_one({'order_id':order_id,'type':'order_created','amount':pricing['grand_total'],'payment_method':body.payment_method,'created_at':now()})
    response={'order_id':order_id,'status':status,'payment_status':payment_status,'pricing':pricing}
    if body.payment_method=='paystation':
        try:
            amount=pricing['advance_required'] if pricing['is_bulk'] else pricing['grand_total']
            pay=await PayStationClient().initiate(doc, amount)
            db.orders.update_one({'order_id':order_id},{'$set':{'paystation_create_response':pay,'paystation_expected_amount':amount,'updated_at':now()}})
            response['paystation']={'payment_url':pay.get('payment_url'),'status':pay.get('status'),'message':pay.get('message')}
        except IntegrationNotConfigured as e: response['paystation']={'configured':False,'message':str(e)}
    return response

@app.post('/api/v1/payments/paystation/ipn')
async def paystation_ipn(payload: dict):
    invoice=str(payload.get('invoice_number','')); trx_status=str(payload.get('trx_status','')).lower(); trx_id=str(payload.get('trx_id',''))
    o=db.orders.find_one({'order_id':invoice})
    if not o: raise HTTPException(404,'Order not found')
    if trx_status!='success': raise HTTPException(422,'Transaction is not successful')
    expected=float(o.get('paystation_expected_amount') or (o['pricing']['advance_required'] if o['pricing'].get('is_bulk') else o['pricing']['grand_total']))
    paid=float(payload.get('trx_amount') or payload.get('payment_amount') or 0)
    if round(paid,2)!=round(expected,2): raise HTTPException(422,'Payment amount mismatch')
    existing=db.payment_transactions.find_one({'trx_id':trx_id}) if trx_id else None
    if existing: return {'status':'success','idempotent':True}
    method=str(payload.get('payment_method','')).strip()
    is_bulk=bool(o.get('pricing',{}).get('is_bulk'))
    payment_status='Partially Paid' if is_bulk else 'Paid'
    update={'payment_status':payment_status,'paystation_trx_id':trx_id,'paystation_payment_method':method,'paid_amount':paid,'paid_at':now(),'updated_at':now()}
    # The retail 2% digital-payment discount is already applied BEFORE PayStation initiation,
    # so every successful hosted-checkout channel (bKash/Nagad/card/bank) gets the same fixed benefit.
    db.orders.update_one({'_id':o['_id']},{'$set':update})
    db.payment_transactions.insert_one({'order_id':invoice,'trx_id':trx_id or f'ipn-{invoice}','provider':'paystation','payment_method':method,'amount':paid,'status':'success','raw':payload,'created_at':now()})
    db.ledger.insert_one({'order_id':invoice,'type':'paystation_payment','amount':paid,'payment_method':method,'trx_id':trx_id,'created_at':now()})
    return {'status':'success','payment_method':method,'payment_discount':o.get('pricing',{}).get('payment_discount',0)}

@app.get('/api/v1/payments/paystation/status/{order_id}')
async def paystation_status(order_id:str):
    o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    try: result=await PayStationClient().status(order_id)
    except IntegrationNotConfigured as e: raise HTTPException(503,str(e))
    return result

@app.get('/api/v1/orders/track')
def track(order_id:str=Query(...),phone:str=Query(...)):
    o=db.orders.find_one({'order_id':order_id,'phone':phone})
    if not o: raise HTTPException(404,'Order not found')
    keep={k:o.get(k) for k in ['order_id','order_status','payment_status','pricing','courier','courier_data','created_at','updated_at']}
    return serialize(keep)

# ---------- Admin ----------
@app.post('/api/v1/admin/login')
def admin_login(body: Login):
    a=db.admins.find_one({'email':body.email.lower()}) or db.staff.find_one({'email':body.email.lower(),'status':'active'})
    if not a or not verify_password(body.password,a['password_hash']): raise HTTPException(401,'Invalid login')
    role=a.get('role','super_admin')
    db.audit_logs.insert_one({'actor_id':str(a['_id']),'actor_role':role,'action':'login','created_at':now()})
    return {'access_token':create_token(str(a['_id']),role),'role':role,'name':a.get('name','')}

def admin(authorization): return require_role(authorization,('admin','super_admin','sales','inventory','support'))
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

@app.get('/api/v1/admin/customers')
def admin_customers(authorization: str|None=Header(None),status:str|None=None,priority:str|None=None,no_order:bool=False):
    admin(authorization); q={}
    if status:q['lead_status']=status
    if priority:q['lead_priority']=priority
    if no_order:q['total_orders']=0
    docs=list(db.customers.find(q,{'password_hash':0}).sort('last_active_at',-1).limit(500))
    for c in docs:
        c['recent_activity']=serialize(list(db.analytics_events.find({'customer_id':str(c['_id'])}).sort('created_at',-1).limit(8)))
    return serialize(docs)

@app.put('/api/v1/admin/customers/{customer_id}/crm')
def update_customer_crm(customer_id:str,payload:dict,authorization: str|None=Header(None)):
    admin(authorization)
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
    admin(authorization)
    o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    if o.get('order_status') in ('Sent to Courier','Delivered','Cancelled'):
        return serialize(o)
    db.orders.update_one({'_id':o['_id']},{'$set':{'order_status':'Confirmed','confirmed_at':now(),'updated_at':now()}})
    # Business rule: after EMXIN calls the customer and Admin confirms, create the default
    # Steadfast consignment automatically. Nothing is sent to courier before this click.
    if settings.courier_default=='steadfast' and settings.steadfast_enabled:
        refreshed=db.orders.find_one({'_id':o['_id']})
        try:
            data=await SteadfastClient().create_order(refreshed)
            db.orders.update_one({'_id':o['_id']},{'$set':{'order_status':'Sent to Courier','courier':'steadfast','courier_data':data,'courier_created_at':now(),'updated_at':now()}})
            db.ledger.insert_one({'order_id':order_id,'type':'courier_created','amount':0,'payment_method':refreshed.get('payment_method'),'courier':'steadfast','cod_amount':refreshed.get('pricing',{}).get('cod_due',0),'courier_billing_mode':refreshed.get('courier_billing_mode'),'created_at':now()})
        except IntegrationNotConfigured:
            pass
    return serialize(db.orders.find_one({'_id':o['_id']}))

@app.post('/api/v1/admin/orders/{order_id}/cancel')
def cancel_order(order_id:str,authorization: str|None=Header(None)):
    admin(authorization); o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    if o.get('order_status') not in ('Cancelled','Delivered'):
        for i in o['items']: db.products.update_one({'_id':ObjectId(i['product_id'])},{'$inc':{'stock':i['quantity'],'reserved':-i['quantity']}})
    db.orders.update_one({'order_id':order_id},{'$set':{'order_status':'Cancelled','updated_at':now()}})
    return {'ok':True}

@app.post('/api/v1/admin/orders/{order_id}/send-courier')
async def send_courier(order_id:str,courier:str='steadfast',authorization: str|None=Header(None)):
    admin(authorization); o=db.orders.find_one({'order_id':order_id})
    if not o: raise HTTPException(404,'Order not found')
    if o['order_status'] not in ('Confirmed','Approved'): raise HTTPException(409,'Confirm the customer/order first')
    try:
        if courier=='steadfast': data=await SteadfastClient().create_order(o)
        elif courier=='pathao': data=await PathaoClient().create_order(o)
        else: raise HTTPException(400,'Unsupported courier')
    except IntegrationNotConfigured as e: raise HTTPException(503,str(e))
    db.orders.update_one({'order_id':order_id},{'$set':{'order_status':'Sent to Courier','courier':courier,'courier_data':data,'updated_at':now()}})
    return {'ok':True,'courier':courier,'data':data}

@app.get('/api/v1/admin/quantity-requests')
def admin_requests(authorization: str|None=Header(None)):
    admin(authorization); order={'Urgent':0,'Priority':1,'Normal':2}
    docs=list(db.quantity_requests.find().sort('created_at',-1).limit(200)); docs.sort(key=lambda x:(order.get(x.get('urgency'),9),-x['created_at'].timestamp()))
    return serialize(docs)

@app.get('/api/v1/admin/dealers')
def admin_dealers(authorization: str|None=Header(None)):
    admin(authorization); return serialize(list(db.dealers.find({}, {'password_hash':0}).sort('created_at',-1)))

@app.post('/api/v1/admin/dealers/{dealer_id}/approve')
def approve_dealer(dealer_id:str,authorization: str|None=Header(None)):
    admin(authorization); db.dealers.update_one({'_id':ObjectId(dealer_id)},{'$set':{'status':'Active','updated_at':now()}}); return {'ok':True}

@app.get('/api/v1/admin/products')
def admin_products(authorization: str|None=Header(None)):
    admin(authorization); return serialize(list(db.products.find().sort('created_at',-1)))

@app.post('/api/v1/admin/products')
def create_product(body:ProductInput,authorization: str|None=Header(None)):
    admin(authorization); d=body.model_dump(); d['slug']=d.get('slug') or slugify(d['name']); d.update({'reserved':0,'created_at':now(),'updated_at':now()}); r=db.products.insert_one(d); return {'id':str(r.inserted_id),'slug':d['slug']}

@app.put('/api/v1/admin/products/{product_id}')
def update_product(product_id:str,body:ProductInput,authorization: str|None=Header(None)):
    admin(authorization); d=body.model_dump(); d['slug']=d.get('slug') or slugify(d['name']); d['updated_at']=now(); db.products.update_one({'_id':ObjectId(product_id)},{'$set':d}); return {'ok':True}

@app.post('/api/v1/admin/categories')
def create_category(body:CategoryInput,authorization: str|None=Header(None)):
    admin(authorization); d=body.model_dump(); d['slug']=d.get('slug') or slugify(d['name']); db.categories.update_one({'slug':d['slug']},{'$set':d},upsert=True); return {'ok':True}

@app.post('/api/v1/admin/brands')
def create_brand(body:BrandInput,authorization: str|None=Header(None)):
    admin(authorization); d=body.model_dump(); d['slug']=d.get('slug') or slugify(d['name']); db.brands.update_one({'slug':d['slug']},{'$set':d},upsert=True); return {'ok':True}

@app.get('/api/v1/admin/cms')
def get_cms(authorization: str|None=Header(None)):
    admin(authorization); return {'homepage':serialize(db.homepage.find_one({'key':'home'},{'_id':0})),'settings':serialize(commerce_settings())}

@app.put('/api/v1/admin/cms/homepage')
def update_homepage(payload:dict,authorization: str|None=Header(None)):
    admin(authorization); payload['updated_at']=now(); db.homepage.update_one({'key':'home'},{'$set':payload},upsert=True); return {'ok':True}

@app.put('/api/v1/admin/settings/commerce')
def update_commerce(payload:dict,authorization: str|None=Header(None)):
    admin(authorization); payload['updated_at']=now(); db.settings.update_one({'key':'commerce'},{'$set':payload},upsert=True); return {'ok':True}

@app.get('/api/v1/admin/ledger')
def ledger(authorization: str|None=Header(None)):
    admin(authorization); return serialize(list(db.ledger.find().sort('created_at',-1).limit(500)))


# ---------- Admin media / staff ----------
@app.post('/api/v1/admin/media/presign')
def admin_media_presign(body: MediaPresign,authorization: str|None=Header(None)):
    admin(authorization)
    ext=(body.filename.rsplit('.',1)[-1].lower() if '.' in body.filename else 'bin')
    safe=re.sub(r'[^a-zA-Z0-9_-]','-',body.filename.rsplit('.',1)[0])[:80]
    key=f"{settings.aws_s3_prefix.strip('/')}/{body.folder}/{now().strftime('%Y/%m')}/{safe}-{secrets.token_hex(4)}.{ext}"
    client=s3_client()
    post=client.generate_presigned_post(Bucket=settings.aws_s3_bucket,Key=key,Fields={'Content-Type':body.content_type},Conditions=[{'Content-Type':body.content_type}],ExpiresIn=settings.s3_presigned_upload_expire_seconds)
    return {'upload':post,'key':key,'public_url':media_public_url(key),'expires_in':settings.s3_presigned_upload_expire_seconds}

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
    return serialize(list(db.categories.find().sort('order',1)))
