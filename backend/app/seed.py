"""Idempotent starter data matching the EMXIN template.

Run once on EC2:  docker compose exec backend python -m app.seed
Existing documents are never overwritten ($setOnInsert), so it is safe after
Admin has edited products/categories.
"""
from .db import db, ensure_indexes
from .helpers import now


def upsert(coll, key, doc):
    doc = {**doc, 'created_at': now(), 'updated_at': now()}
    db[coll].update_one(key, {'$setOnInsert': doc}, upsert=True)


def run():
    ensure_indexes()
    cats = [
        ('Smart Glasses', 'smart-glasses', 'AI & Camera Enabled', 1),
        ('Sunglasses', 'sunglasses', 'Stylish & UV Protection', 2),
        ('Frames', 'frames', 'Lightweight & Comfortable', 3),
    ]
    for n, s, sub, o in cats:
        upsert('categories', {'slug': s}, {'name': n, 'slug': s, 'subtitle': sub, 'order': o, 'visible': True,
                                           'show_on_home': True, 'thumbnail_url': ''})
    for o, n in enumerate(['EMXIN', 'AIMB', 'JM91', 'GTS1', 'TXK'], 1):
        upsert('brands', {'slug': n.lower()}, {'name': n, 'slug': n.lower(), 'order': o, 'visible': True, 'logo_url': ''})
    base = {'images': [], 'media': [], 'video_url': '', 'status': 'active', 'reserved': 0, 'sold_count': 0,
            'rating': 0, 'review_count': 0, 'specifications': [], 'box_contents': [], 'faq': [], 'features_bn': [],
            'name_bn': '', 'description_bn': '', 'low_stock_threshold': 5, 'promo_image_url': '', 'compare_note': ''}
    products = [
        {'name': 'AIMB G2 Pro', 'slug': 'aimb-g2-pro', 'subtitle': 'AI Smart Glasses (With Camera)', 'category_slug': 'smart-glasses',
         'brand_slug': 'emxin', 'model': 'AIMB-G2-Pro', 'sku': 'EMX-G2P-001', 'price': 6499, 'sale_price': 5499, 'stock': 20,
         'weight_kg': .35, 'colors': ['Black', 'White'], 'color_hex': {'Black': '#111111', 'White': '#ffffff'}, 'has_camera': True,
         'badge': 'Featured', 'featured': True, 'new_collection': True, 'sort_order': 1,
         'features': ['8MP Camera', 'AI Assistant', 'Wi-Fi Connectivity', 'Voice Recording', '8 Hours Battery'],
         'description': 'The AIMB G2 Pro is a next-generation AI smart glasses designed to combine intelligent assistance, smart connectivity, and everyday comfort in one lightweight wearable. Equipped with an 8MP ultra-clear camera, it allows you to capture photos and videos conveniently while staying hands-free.',
         'specifications': ['Camera: 8MP ultra-clear (photo & video)', 'Connectivity: Wi-Fi & Bluetooth', 'Battery: Up to 8 hours', 'Assistant: Real-time AI (voice & translation)'],
         'box_contents': ['AIMB G2 Pro smart glasses', 'Magnetic charging cable', 'Protective case', 'Cleaning cloth', 'User manual']},
        {'name': 'JM91 S', 'slug': 'jm91-s', 'subtitle': 'Smart Sunglasses', 'category_slug': 'sunglasses', 'brand_slug': 'jm91',
         'model': 'JM91-S', 'sku': 'EMX-JM91-001', 'price': 3899, 'sale_price': None, 'stock': 15, 'weight_kg': .3,
         'colors': ['Black'], 'color_hex': {'Black': '#111111'}, 'has_camera': False, 'badge': 'New', 'featured': True,
         'new_collection': True, 'sort_order': 2, 'features': ['Bluetooth Audio', 'UV400 Lenses', 'Voice Calls', '6 Hours Battery'],
         'description': 'Smart sunglasses with open-ear audio and UV400 polarised lenses.'},
        {'name': 'GTS1 Frame', 'slug': 'gts1-frame', 'subtitle': 'Premium Optical Frame', 'category_slug': 'frames', 'brand_slug': 'gts1',
         'model': 'GTS1', 'sku': 'EMX-GTS1-001', 'price': 1699, 'sale_price': None, 'stock': 30, 'weight_kg': .2,
         'colors': ['Black'], 'color_hex': {'Black': '#111111'}, 'has_camera': False, 'badge': '', 'featured': True,
         'new_collection': False, 'sort_order': 3, 'features': ['Lightweight TR90', 'Spring Hinges', 'Prescription Ready'],
         'description': 'Lightweight, comfortable premium optical frame.'},
        {'name': 'TXK Pro', 'slug': 'txk-pro', 'subtitle': 'Smart Glasses', 'category_slug': 'smart-glasses', 'brand_slug': 'txk',
         'model': 'TXK-Pro', 'sku': 'EMX-TXK-001', 'price': 3999, 'sale_price': None, 'stock': 20, 'weight_kg': .3,
         'colors': ['Black'], 'color_hex': {'Black': '#111111'}, 'has_camera': False, 'badge': 'Hot', 'featured': True,
         'new_collection': True, 'sort_order': 4,
         'features': ['Bluetooth Audio', 'Voice Calls', 'Multilingual Translation', 'Smart Connectivity', '8 Hours Battery'],
         'description': 'Camera-free smart glasses for calls, music and translation.'},
    ]
    for p in products:
        upsert('products', {'slug': p['slug']}, {**base, **p})
    upsert('coupons', {'code': 'WELCOME100'}, {'code': 'WELCOME100', 'type': 'fixed', 'value': 100, 'active': False,
                                               'allow_bulk': False, 'min_order': 1000, 'description': 'Welcome offer'})
    print('Seed complete')


if __name__ == '__main__':
    run()
