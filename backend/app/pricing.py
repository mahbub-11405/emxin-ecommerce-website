from .config import get_settings
settings=get_settings()

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
    is_bulk=qty>=bulk_threshold
    bulk_discount_amount=round(subtotal*bulk_discount/100,2) if is_bulk else 0
    after_bulk=subtotal-bulk_discount_amount
    coupon_discount=0.0
    if coupon and (not is_bulk or coupon.get('allow_bulk')):
        if coupon.get('type')=='percentage':
            coupon_discount=after_bulk*float(coupon.get('value',0))/100
            cap=coupon.get('max_discount')
            if cap: coupon_discount=min(coupon_discount,float(cap))
        else: coupon_discount=float(coupon.get('value',0))
        coupon_discount=min(coupon_discount,after_bulk)
    product_net=after_bulk-coupon_discount
    dhaka=(district or '').strip().lower() in ('dhaka','ঢাকা')
    delivery=float(cfg.get('dhaka_delivery_charge',settings.dhaka_delivery_charge) if dhaka else cfg.get('outside_dhaka_delivery_charge',settings.outside_dhaka_delivery_charge))
    estimated_shipping=0.0
    if qty>=int(cfg.get('estimated_shipping_from_qty',settings.estimated_shipping_from_qty)):
        extra_rate=float(cfg.get('extra_shipping_per_kg',settings.extra_shipping_per_kg))
        estimated_shipping=round(max(0,total_weight-1)*extra_rate,2)
    gross_total=round(product_net+delivery+estimated_shipping,2)
    # Retail prepaid/digital orders receive a fixed configurable discount.
    # Bulk/dealer orders use their separate bulk pricing + advance policy and do not stack this retail benefit.
    digital_discount_percent=float(cfg.get('digital_payment_discount_percent',settings.digital_payment_discount_percent))
    # Business rule: every digital (PayStation) payment always gets the configured discount — retail and bulk.
    payment_discount=float(round(gross_total*digital_discount_percent/100)) if payment_method in ('paystation','manual') else 0.0
    grand=float(round(gross_total-payment_discount))  # whole taka: PayStation requires integer amounts
    advance_percent=float(cfg.get('bulk_advance_percent',settings.bulk_advance_percent)) if is_bulk else 0
    if is_bulk:
        advance=float(round(grand*advance_percent/100))
        cod_due=float(round(grand-advance))
    else:
        advance=grand if payment_method in ('paystation','manual') else 0
        cod_due=grand if payment_method=='cod' else 0
    return dict(quantity=qty,is_bulk=is_bulk,subtotal=round(subtotal,2),bulk_discount=bulk_discount_amount,coupon_discount=round(coupon_discount,2),delivery_charge=delivery,estimated_shipping=estimated_shipping,gross_total=gross_total,payment_discount=payment_discount,digital_payment_discount_percent=digital_discount_percent if payment_method in ('paystation','manual') else 0,grand_total=grand,advance_required=advance,cod_due=cod_due,total_weight_kg=round(total_weight,3))
