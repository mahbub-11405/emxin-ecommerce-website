from pymongo import MongoClient, ASCENDING, DESCENDING
from .config import get_settings

settings = get_settings()
client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=7000)
db = client[settings.mongodb_db_name]

def ensure_indexes():
    db.products.create_index('slug', unique=True)
    db.products.create_index([('category_slug', ASCENDING), ('brand_slug', ASCENDING), ('status', ASCENDING)])
    db.categories.create_index('slug', unique=True)
    db.brands.create_index('slug', unique=True)
    db.orders.create_index('order_id', unique=True)
    db.orders.create_index([('phone', ASCENDING), ('created_at', DESCENDING)])
    db.quantity_requests.create_index([('urgency', ASCENDING), ('created_at', DESCENDING)])
    db.dealers.create_index('phone', unique=True)
    db.dealers.create_index('email', unique=True, sparse=True)
    db.admins.create_index('email', unique=True)
    db.customers.create_index('email', unique=True)
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
