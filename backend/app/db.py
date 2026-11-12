from pymongo import MongoClient, ASCENDING, DESCENDING
from .config import get_settings

settings = get_settings()
client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=7000, tz_aware=True)
db = client[settings.mongodb_db_name]

def _email_index(coll):
    # Phone-only registration: many accounts have no email. A plain unique (or sparse) index would
    # reject the second account whose email is missing/null, so only index real string emails.
    info=coll.index_information().get('email_1')
    if info and not info.get('partialFilterExpression'): coll.drop_index('email_1')
    coll.create_index('email', unique=True, partialFilterExpression={'email':{'$type':'string'}})

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
    db.payment_transactions.create_index('trx_id', unique=True, sparse=True)
    db.staff.create_index('email', unique=True)

    db.sms_outbox.create_index("event_key",unique=True)
    db.reviews.create_index([("product_id",ASCENDING),("status",ASCENDING),("created_at",DESCENDING)])
    db.questions.create_index([("product_id",ASCENDING),("status",ASCENDING)])
    db.inventory_log.create_index([("product_id",ASCENDING),("created_at",DESCENDING)])
    db.audit_logs.create_index([("created_at",DESCENDING)])
    db.orders.create_index([("created_at",DESCENDING)])
    db.orders.create_index([("order_status",ASCENDING),("created_at",DESCENDING)])
    db.media_versions.create_index([("entity_type",ASCENDING),("entity_id",ASCENDING),("created_at",DESCENDING)])
