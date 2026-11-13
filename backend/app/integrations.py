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

    async def initiate(self, order, amount: float, invoice_number: str|None=None):
        self._check()
        payload={
            'merchantId':settings.paystation_merchant_id,
            'password':settings.paystation_password,
            'invoice_number':invoice_number or order['order_id'],
            'currency':'BDT',
            'payment_amount':str(int(round(amount))),
            'pay_with_charge':str(settings.paystation_pay_with_charge),
            'reference':order['order_id'],
            'cust_name':order['customer_name'],
            'cust_phone':order['phone'],
            'cust_email':order.get('email') or 'customer@emxin.com.bd',
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

class BulkSmsBdClient:
    """BulkSMSBD HTTP API: GET {url}?api_key=…&type=text&number=8801…&senderid=…&message=… → JSON with response_code 202 on success."""
    def _params(self, phone: str, body: str):
        if not settings.bulksmsbd_api_key: raise IntegrationNotConfigured('BulkSMSBD API key is missing')
        number=''.join(ch for ch in phone if ch.isdigit())
        if number.startswith('01'): number='88'+number
        params={'api_key':settings.bulksmsbd_api_key,'type':'text' if is_gsm7(body) else 'unicode','number':number,'message':body}  # Bangla needs unicode
        if settings.bulksmsbd_sender_id: params['senderid']=settings.bulksmsbd_sender_id
        return params
    @staticmethod
    def _check(r):
        r.raise_for_status()
        try: data=r.json()
        except Exception: data={'raw':r.text[:300]}
        code=str(data.get('response_code','')) if isinstance(data,dict) else ''
        if code and code not in ('202','200'):  # e.g. 1007 = low balance, 1002 = sender id invalid
            raise RuntimeError(f"BulkSMSBD error {code}: {data.get('error_message') or data.get('success_message') or data}")
        return data
    async def send(self, phone: str, body: str, *_):
        async with httpx.AsyncClient(timeout=20) as c:
            return self._check(await c.get(settings.bulksmsbd_api_url,params=self._params(phone,body)))
    def send_sync(self, phone: str, body: str):
        with httpx.Client(timeout=20) as c:
            return self._check(c.get(settings.bulksmsbd_api_url,params=self._params(phone,body)))

GSM7=set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€")
def is_gsm7(text: str) -> bool: return all(ch in GSM7 for ch in text)
def sms_parts(text: str) -> int:
    """How many SMS this text costs (160 chars normal / 70 Unicode; longer texts split into 153 / 67 per part)."""
    if is_gsm7(text):
        n=sum(2 if ch in '^{}\\[~]|€' else 1 for ch in text); return 1 if n<=160 else -(-n//153)
    n=len(text); return 1 if n<=70 else -(-n//67)

async def send_sms(phone: str, body: str, *_):
    """All SMS (OTP + order/marketing) go through BulkSMSBD."""
    return await BulkSmsBdClient().send(phone,body)

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
