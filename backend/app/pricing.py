import math
from .config import get_settings
settings=get_settings()

def tk(x) -> float:
    """Whole taka, .5 always up (409.5 -> 410, 408.5 -> 409). Python's round() goes to the even number (408.5 -> 408),
    which showed some discounts 1 taka short. Every line is rounded first, so the lines always add up to the total."""
    return float(math.floor(float(x)+0.5+1e-9))

def calculate(items, products_by_id, district: str, payment_method: str, coupon=None, db_settings=None):
    cfg=db_settings or {}
    bulk_threshold=int(cfg.get('bulk_threshold_qty',settings.bulk_threshold_qty))
    bulk_discount=float(cfg.get('bulk_discount_percent',settings.bulk_discount_percent))
    qty=sum(int(x['quantity']) for x in items)
    subtotal=0.0; total_weight=0.0
    for it in items:
        p=products_by_id[it['product_id']]
        subtotal += float(p.get('sale_price') or p['price']) * int(it['quantity'])
        total_weight += float(p.get('weight_kg',0.3))*int(it['quantity'])
    subtotal=tk(subtotal)
    is_bulk=qty>=bulk_threshold
    # dealer / bulk discount per line: a category can cap it ('fixed', e.g. power banks max 5%) or switch it off ('none')
    caps=cfg.get('category_dealer') or {}
    bulk_discount_amount=0.0
    if is_bulk and bulk_discount>0:
        for it in items:
            p=products_by_id[it['product_id']]; mode,cap=caps.get(p.get('category_slug'),('tiers',None))
            pct=0.0 if mode=='none' else min(bulk_discount,float(cap)) if mode=='fixed' and cap is not None else bulk_discount
            bulk_discount_amount+=float(p.get('sale_price') or p['price'])*int(it['quantity'])*pct/100
    bulk_discount_amount=tk(bulk_discount_amount)
    after_bulk=subtotal-bulk_discount_amount
    coupon_discount=0.0
    # A coupon is taken ONCE per order whatever the quantity, and also on bulk/dealer orders (on top of the dealer discount)
    if coupon:
        if coupon.get('type')=='percentage':
            coupon_discount=after_bulk*float(coupon.get('value',0))/100
            cap=coupon.get('max_discount')
            if cap: coupon_discount=min(coupon_discount,float(cap))
        else: coupon_discount=float(coupon.get('value',0))
        coupon_discount=tk(min(coupon_discount,after_bulk))
    product_net=after_bulk-coupon_discount
    dhaka=(district or '').strip().lower() in ('dhaka','ঢাকা')
    delivery=float(cfg.get('dhaka_delivery_charge',settings.dhaka_delivery_charge) if dhaka else cfg.get('outside_dhaka_delivery_charge',settings.outside_dhaka_delivery_charge))
    estimated_shipping=0.0
    if qty>=int(cfg.get('estimated_shipping_from_qty',settings.estimated_shipping_from_qty)):
        extra_rate=float(cfg.get('extra_shipping_per_kg',settings.extra_shipping_per_kg))
        estimated_shipping=tk(max(0,total_weight-1)*extra_rate)
    delivery=tk(delivery)
    gross_total=tk(product_net+delivery+estimated_shipping)
    # Retail prepaid/digital orders receive a fixed configurable discount.
    # Bulk/dealer orders use their separate bulk pricing + advance policy and do not stack this retail benefit.
    digital_discount_percent=float(cfg.get('digital_payment_discount_percent',settings.digital_payment_discount_percent))
    # Business rule: every digital payment (PayStation / bKash / Nagad) gets the discount — retail and bulk —
    # on the products' actual price (subtotal) only. A coupon or dealer discount never makes it smaller, and it is
    # never taken on delivery or shipping. Then the coupon is subtracted and delivery added.
    payment_discount=tk(subtotal*digital_discount_percent/100) if payment_method in ('paystation','manual') else 0.0
    grand=tk(gross_total-payment_discount)  # whole taka: PayStation requires integer amounts
    advance_percent=float(cfg.get('bulk_advance_percent',settings.bulk_advance_percent)) if is_bulk else 0
    if is_bulk:
        advance=tk(grand*advance_percent/100)
        cod_due=tk(grand-advance)
    else:
        advance=grand if payment_method in ('paystation','manual') else 0
        cod_due=grand if payment_method=='cod' else 0
    return dict(quantity=qty,is_bulk=is_bulk,subtotal=subtotal,bulk_discount=bulk_discount_amount,coupon_discount=coupon_discount,delivery_charge=delivery,estimated_shipping=estimated_shipping,gross_total=gross_total,payment_discount=payment_discount,digital_payment_discount_percent=digital_discount_percent if payment_method in ('paystation','manual') else 0,grand_total=grand,advance_required=advance,cod_due=cod_due,total_weight_kg=round(total_weight,3))
