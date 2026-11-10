import json, uuid
import httpx
from .config import get_settings
settings=get_settings()

class IntegrationNotConfigured(Exception): pass

def join(base,path): return base.rstrip('/')+'/'+path.lstrip('/')

class PayStationClient:
    def _check(self):
        if not settings.paystation_enabled: raise IntegrationNotConfigured('PayStation is disabled')
        if not settings.paystation_merchant_id or not settings.paystation_password: raise IntegrationNotConfigured('PayStation credentials are missing')

    async def initiate(self, order, amount: float):
        self._check()
        payload={
            'merchantId':settings.paystation_merchant_id,
            'password':settings.paystation_password,
            'invoice_number':order['order_id'],
            'currency':'BDT',
            'payment_amount':str(round(amount,2)),
            'pay_with_charge':str(settings.paystation_pay_with_charge),
            'reference':order['order_id'],
            'cust_name':order['customer_name'],
            'cust_phone':order['phone'],
            'cust_email':order.get('email') or 'customer@emxin.local',
            'cust_address':order.get('address',''),
            'callback_url':settings.paystation_callback_url,
            'checkout_items':json.dumps(order.get('items',[]),ensure_ascii=False),
            'opt_a':order['order_id'],
        }
        async with httpx.AsyncClient(timeout=25) as c:
            r=await c.post(join(settings.paystation_base_url,settings.paystation_initiate_path),data=payload,headers={'Accept':'application/json'})
            r.raise_for_status(); return r.json()

    async def status(self, invoice_number: str):
        self._check()
        async with httpx.AsyncClient(timeout=20) as c:
            r=await c.post(join(settings.paystation_base_url,settings.paystation_status_path),data={'invoice_number':invoice_number},headers={'merchantId':settings.paystation_merchant_id,'Accept':'application/json'})
            r.raise_for_status(); return r.json()

class NishchitClient:
    async def send(self, phone: str, body: str, idempotency_key: str, reference: str=''):
        if not settings.nishchit_enabled: raise IntegrationNotConfigured('Nishchit is disabled')
        if not settings.nishchit_api_key: raise IntegrationNotConfigured('Nishchit API key is missing')
        payload={'to':phone,'body':body}
        if reference: payload['reference']=reference
        async with httpx.AsyncClient(timeout=20) as c:
            r=await c.post(join(settings.nishchit_api_base_url,settings.nishchit_messages_path),json=payload,headers={'Authorization':f'Bearer {settings.nishchit_api_key}','Content-Type':'application/json','Idempotency-Key':idempotency_key})
            r.raise_for_status(); return r.json()

class SteadfastClient:
    async def create_order(self, order):
        if not settings.steadfast_enabled: raise IntegrationNotConfigured('Steadfast is disabled')
        if not all([settings.steadfast_base_url,settings.steadfast_create_order_path]): raise IntegrationNotConfigured('Steadfast endpoint is not configured')
        payload={'invoice':order['order_id'],'recipient_name':order['customer_name'],'recipient_phone':order['phone'],'recipient_address':order['address'],'cod_amount':order['pricing']['cod_due'],'note':order.get('courier_note','')}
        async with httpx.AsyncClient(timeout=20) as c:
            r=await c.post(join(settings.steadfast_base_url,settings.steadfast_create_order_path),headers={'Api-Key':settings.steadfast_api_key,'Secret-Key':settings.steadfast_secret_key,'Content-Type':'application/json'},json=payload)
            r.raise_for_status(); return r.json()

class PathaoClient:
    async def create_order(self, order):
        if not settings.pathao_enabled: raise IntegrationNotConfigured('Pathao is disabled')
        if not all([settings.pathao_base_url,settings.pathao_create_order_path]): raise IntegrationNotConfigured('Pathao endpoint is not configured')
        payload={'merchant_order_id':order['order_id'],'recipient_name':order['customer_name'],'recipient_phone':order['phone'],'recipient_address':order['address'],'amount_to_collect':order['pricing']['cod_due']}
        async with httpx.AsyncClient(timeout=20) as c:
            r=await c.post(join(settings.pathao_base_url,settings.pathao_create_order_path),json=payload)
            r.raise_for_status(); return r.json()
