from pymongo import MongoClient, ASCENDING, DESCENDING
from .config import get_settings

settings = get_settings()
from pymongo import monitoring

# data_version goes up after every successful write to the collections the dashboard reads.
# The dashboard cache is only used while this number is unchanged, so a new order / payment shows at once.
WATCHED = {'orders', 'ledger', 'products', 'dealers', 'reviews', 'questions', 'quantity_requests', 'payment_transactions', 'recycle_bin'}
TRAFFIC = {'analytics_events'}  # visitors / product views / add to cart: live on the dashboard, but not a reason to reload badges
WRITE_CMDS = {'insert', 'update', 'delete', 'findAndModify'}
data_version = [0]   # business data changed (orders, payments, stock …)
live_version = [0]   # anything the dashboard shows changed (business data + visitor traffic)
# public_version goes up after any write to what the shop shows (products, stock, prices, categories, homepage, settings, coupons)
PUBLIC = {'products', 'categories', 'brands', 'homepage', 'settings', 'coupons', 'orders'}
public_version = [0]


class _WriteWatcher(monitoring.CommandListener):
    def __init__(self):
        self.pending = {}  # request_id -> True (business write) / False (traffic)
        self.public_pending = set()

    def started(self, e):
        if e.command_name in WRITE_CMDS:
            coll = e.command.get(e.command_name)
            if coll in PUBLIC:
                self.public_pending.add(e.request_id)
            if coll in WATCHED:
                self.pending[e.request_id] = True
            elif coll in TRAFFIC:
                self.pending[e.request_id] = False

    def succeeded(self, e):
        if e.request_id in self.public_pending:
            self.public_pending.discard(e.request_id); public_version[0] += 1
        business = self.pending.pop(e.request_id, None)
        if business is None:
            return
        if business:
            data_version[0] += 1
        live_version[0] += 1

    def failed(self, e):
        self.pending.pop(e.request_id, None); self.public_pending.discard(e.request_id)


write_watcher = _WriteWatcher()
client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=7000, tz_aware=True, event_listeners=[write_watcher])
db = client[settings.mongodb_db_name]

def _email_index(coll):
    # The mobile number is the account key (unique). Email is optional and NOT unique: one person can have
    # several numbers (accounts) with the same email. Replace any old unique email index with a plain one.
    info=coll.index_information().get('email_1')
    if info and (info.get('unique') or info.get('partialFilterExpression')): coll.drop_index('email_1'); info=None
    if not info: coll.create_index('email')

def ensure_indexes():
    _email_index(db.customers); _email_index(db.dealers)
    db.media_library.create_index([('created_at',DESCENDING)])
    db.products.create_index('slug', unique=True)
    db.products.create_index([('category_slug', ASCENDING), ('brand_slug', ASCENDING), ('status', ASCENDING)])
    db.categories.create_index('slug', unique=True)
    db.brands.create_index('slug', unique=True)
    db.orders.create_index('order_id', unique=True)
    db.orders.create_index([('phone', ASCENDING), ('created_at', DESCENDING)])
    db.quantity_requests.create_index([('urgency', ASCENDING), ('created_at', DESCENDING)])
    db.dealers.create_index('phone', unique=True)
    db.admins.create_index('email', unique=True)
    db.customers.create_index('phone', unique=True)
    db.customers.create_index([('lead_status', ASCENDING), ('last_active_at', DESCENDING)])
    db.analytics_events.create_index([('created_at', DESCENDING)])
    db.analytics_events.create_index([('session_id', ASCENDING), ('created_at', DESCENDING)])
    db.analytics_events.create_index([('customer_id', ASCENDING), ('created_at', DESCENDING)])
    db.coupons.create_index('code', unique=True)
    db.wishlists.create_index('customer_id', unique=True)

    db.otp_challenges.create_index([('phone', ASCENDING), ('purpose', ASCENDING), ('created_at', DESCENDING)])
    db.otp_challenges.create_index('expires_at', expireAfterSeconds=0)
    db.trusted_devices.create_index('token_hash', unique=True)
    db.trusted_devices.create_index('expires_at', expireAfterSeconds=0)  # 30 days after the OTP, the device needs a new OTP
    db.trusted_devices.create_index([('customer_id', ASCENDING)])
    db.payment_transactions.create_index('trx_id', unique=True, sparse=True)
    db.staff.create_index('email', unique=True)

    db.sms_outbox.create_index("event_key",unique=True)
    db.tg_outbox.create_index("key",unique=True); db.tg_outbox.create_index([("status",1),("created_at",1)])
    db.checkout_drafts.create_index([("phone",1),("status",1)]); db.checkout_drafts.create_index([("status",1),("updated_at",1)])
    db.reviews.create_index([("product_id",ASCENDING),("status",ASCENDING),("created_at",DESCENDING)])
    db.questions.create_index([("product_id",ASCENDING),("status",ASCENDING)])
    db.inventory_log.create_index([("product_id",ASCENDING),("created_at",DESCENDING)])
    db.audit_logs.create_index([("created_at",DESCENDING)])
    db.orders.create_index([("created_at",DESCENDING)])
    db.orders.create_index([("order_status",ASCENDING),("created_at",DESCENDING)])
    db.media_versions.create_index([("entity_type",ASCENDING),("entity_id",ASCENDING),("created_at",DESCENDING)])
    # --- speed: every list / count the dashboard, admin pages, webhooks and the shop run is served by an index
    A,D=ASCENDING,DESCENDING
    for coll,keys in (
        ('analytics_events',[('event_type',A),('created_at',D)]),
        ('orders',[('customer_id',A),('created_at',D)]), ('orders',[('dealer_id',A),('created_at',D)]),
        ('orders',[('courier_status',A),('courier_updated_at',D)]), ('orders',[('courier_consignment_id',A)]),
        ('orders',[('payment_status',A),('created_at',D)]), ('orders',[('manual_payment.status',A)]), ('orders',[('coupon_code',A),('order_status',A)]),
        ('products',[('status',A),('created_at',D)]), ('products',[('status',A),('sold_count',D)]), ('products',[('status',A),('stock',A)]),
        ('products',[('status',A),('featured',A)]), ('products',[('status',A),('new_collection',A)]), ('products',[('sku',A)]),
        ('dealers',[('status',A),('created_at',D)]), ('reviews',[('status',A),('created_at',D)]), ('questions',[('status',A),('created_at',D)]),
        ('quantity_requests',[('status',A),('created_at',D)]),
        ('ledger',[('created_at',D)]), ('ledger',[('order_id',A)]),
        ('sms_outbox',[('status',A),('created_at',A)]), ('sms_outbox',[('order_id',A)]), ('sms_outbox',[('created_at',D)]),
        ('payment_transactions',[('order_id',A)]), ('courier_webhooks',[('order_id',A)]), ('courier_webhooks',[('idempotency_key',A)]),
        ('recycle_bin',[('deleted_at',D)]), ('recycle_bin',[('kind',A),('deleted_at',D)]), ('recycle_bin',[('kind',A),('doc.phone',A)]), ('recycle_bin',[('kind',A),('doc.customer_id',A)]), ('recycle_bin',[('kind',A),('doc.order_id',A)]),
    ):
        try: db[coll].create_index(keys)
        except Exception: pass  # an equivalent index already exists
