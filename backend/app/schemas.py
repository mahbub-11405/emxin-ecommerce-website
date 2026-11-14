from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Literal

class OrderItem(BaseModel):
    product_id: str
    quantity: int=Field(ge=1,le=9999)
    frame_color: str='Black'
class OrderCreate(BaseModel):
    customer_name: str; phone: str; email: Optional[EmailStr]=None; address: str; district: str
    items: list[OrderItem]
    payment_method: Literal['cod','paystation','manual']='cod'
    # manual = bKash/Nagad Send Money to EMXIN's number; customer gives the TrxID, Admin verifies it
    manual_channel: Optional[Literal['bkash','nagad']]=None; trx_id: Optional[str]=None; sender_number: Optional[str]=None
    coupon_code: Optional[str]=None; dealer_opt_in: bool=False; shop_name: Optional[str]=None
class OrderQuote(BaseModel):
    items: list[OrderItem]; district: str='Dhaka'; payment_method: Literal['cod','paystation','manual']='cod'; coupon_code: Optional[str]=None; dealer_opt_in: bool=False
class ManualPaymentSubmit(BaseModel):
    channel: Literal['bkash','nagad']; trx_id: str=Field(min_length=6,max_length=30); sender_number: str=Field(min_length=10,max_length=20)
class ManualPaymentReview(BaseModel):
    action: Literal['verify','reject']; amount_received: Optional[float]=None; note: str=''; confirm: bool=True
class QuantityRequest(BaseModel):
    product_id: str; name: str; shop_name: str; phone: str; email: Optional[EmailStr]=None
    color_quantities: dict[str,int]={}; total_quantity: int=Field(default=0,ge=0,le=100000); urgency: Literal['Normal','Priority','Urgent']='Normal'; message: str=''; dealer_opt_in: bool=False
class DealerApply(BaseModel):
    name: str; shop_name: str; phone: str; email: Optional[EmailStr]=None; address: str; password: str=Field(min_length=8); business_type: str='Retailer'; otp_verification_id: Optional[str]=None; preferred_language: Literal['en','bn']='bn'; terms_accepted: bool=False
class Login(BaseModel): email: str; password: str; remember: bool=False  # admin: keep me signed in on this device
class CustomerRegister(BaseModel):
    name: str; phone: str; email: EmailStr; password: str=Field(min_length=8); shop_name: Optional[str]=None; location: Optional[str]=None; otp_verification_id: Optional[str]=None; preferred_language: Literal['en','bn']='bn'
class OTPRequest(BaseModel): phone: str; purpose: Literal['customer_register','dealer_register','login']='customer_register'; language: Literal['en','bn']='bn'
class OTPVerify(BaseModel): phone: str; purpose: Literal['customer_register','dealer_register','login']='customer_register'; code: str=Field(min_length=4,max_length=8)
class AnalyticsEvent(BaseModel):
    event_type: Literal['page_view','product_view','wishlist','add_to_cart','checkout_started','quantity_request','dealer_interest']
    session_id: str; path: str=''; product_id: Optional[str]=None; product_name: Optional[str]=None; metadata: dict={}
class ProductMedia(BaseModel):
    url: str
    type: Literal['image','video']
    name: Optional[str]=None

class ProductInput(BaseModel):
    name: str; name_bn: str=''; slug: Optional[str]=None; category_slug: str; brand_slug: str; price: float=Field(gt=0); sale_price: Optional[float]=None
    stock: int=Field(ge=0); weight_kg: float=Field(default=.3,gt=0); colors: list[str]=['Black']; features: list[str]=[]; features_bn: list[str]=[]
    description: str=''; description_bn: str=''; specifications: list[str]=[]; box_contents: list[str]=[]; faq: list[dict]=[]; images: list[str]=[]; video_url: str=''; media: list[ProductMedia]=Field(default_factory=list); status: Literal['active','draft','hidden']='active'; featured: bool=False; new_collection: bool=False
    model: str=''; sku: str=''; badge: Literal['','Featured','New','Hot','Sale','Limited']=''; subtitle: str=''; has_camera: bool=False
    color_hex: dict[str,str]={}; sort_order: int=0; image_fit: Literal['','contain','cover']=''; low_stock_threshold: int=Field(default=5,ge=0)
    compare_note: str=''; promo_image_url: str=''; highlights: list[str]=[]
class CategoryInput(BaseModel):
    name: str; name_bn: str=''; slug: Optional[str]=None; order: int=0; visible: bool=True; thumbnail_url: str=''; image_fit: Literal['','contain','cover']=''; subtitle: str=''; icon: str=''; show_on_home: bool=True
    code: str=Field(default='',max_length=5,pattern=r'^[A-Za-z0-9]{0,5}$')  # short category code used in SKU / stock codes, e.g. SMG, SEG, SSG
class BrandInput(BaseModel):
    name: str; slug: Optional[str]=None; order: int=0; visible: bool=True; logo_url: str=''
class StaffCreate(BaseModel):
    name: str; email: EmailStr; phone: str=''; role: Literal['admin','sales','marketing','inventory','support']; password: str=Field(min_length=8); status: Literal['active','disabled']='active'
class MediaPresign(BaseModel):
    # folder = section[/group[/role]] e.g. 'product/aimb-g2-pro', 'product/aimb-g2-pro/banner', 'category/smart-glasses', 'homepage/hero', 'branding/favicon'
    filename: str; content_type: str; folder: str=Field(default='library',pattern=r'^[a-z][a-z0-9-]{1,30}(/[a-z0-9][a-z0-9-]{0,60}){0,2}$'); size: int=Field(default=0,ge=0)

class CouponInput(BaseModel):
    code: str=Field(min_length=3,max_length=32); type: Literal['percentage','fixed']='fixed'; value: float=Field(gt=0)
    max_discount: Optional[float]=None; min_order: float=0; usage_limit: Optional[int]=None; active: bool=True; allow_bulk: bool=False
    starts_at: Optional[str]=None; ends_at: Optional[str]=None; description: str=''
class OrderStatusUpdate(BaseModel):
    order_status: Optional[Literal['Pending Confirmation','Confirmed','Processing','Sent to Courier','Delivered','Completed','Returned','Cancelled']]=None
    payment_status: Optional[Literal['Unpaid','Pending Payment','Pending Advance Payment','Advance Required','Awaiting Advance Verification','Advance Paid','Paid','COD Collected','Refunded','Failed']]=None
    payment_channel: Optional[Literal['bkash','nagad','rocket','card','bank','cod','paystation','other']]=None
    note: str=''
class ReviewInput(BaseModel):
    product_id: str; rating: int=Field(ge=1,le=5); title: str=Field(default='',max_length=120); body: str=Field(min_length=3,max_length=2000)
class QuestionInput(BaseModel):
    product_id: str; question: str=Field(min_length=5,max_length=500); name: str=''

class PhoneRegister(BaseModel):
    name: str=Field(min_length=2,max_length=80); phone: str; verification_id: str
    email: Optional[EmailStr]=None; district: Optional[str]=None; address: Optional[str]=None
class MediaOrganize(BaseModel):
    dry_run: bool=True

class MediaUse(BaseModel):
    url: str; target: Literal['product','category','hero','promo','product_banner','logo','logo_dark','favicon','hero_video']; id: Optional[str]=None

class MediaRecord(BaseModel):
    url: str; key: str; type: Literal['image','video']; name: str=''; size: int=0; folder: str='product'
