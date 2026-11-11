from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Literal

class OrderItem(BaseModel):
    product_id: str
    quantity: int=Field(ge=1,le=9999)
    frame_color: str='Black'
class OrderCreate(BaseModel):
    customer_name: str; phone: str; email: Optional[EmailStr]=None; address: str; district: str
    items: list[OrderItem]
    payment_method: Literal['cod','paystation','bank']='cod'
    coupon_code: Optional[str]=None; dealer_opt_in: bool=False; shop_name: Optional[str]=None
class QuantityRequest(BaseModel):
    product_id: str; name: str; shop_name: str; phone: str; email: Optional[EmailStr]=None
    color_quantities: dict[str,int]={}; urgency: Literal['Normal','Priority','Urgent']='Normal'; message: str=''; dealer_opt_in: bool=False
class DealerApply(BaseModel):
    name: str; shop_name: str; phone: str; email: Optional[EmailStr]=None; address: str; password: str=Field(min_length=8); business_type: str='Retailer'; otp_verification_id: Optional[str]=None; preferred_language: Literal['en','bn']='bn'
class Login(BaseModel): email: str; password: str
class CustomerRegister(BaseModel):
    name: str; phone: str; email: EmailStr; password: str=Field(min_length=8); shop_name: Optional[str]=None; location: Optional[str]=None; otp_verification_id: Optional[str]=None; preferred_language: Literal['en','bn']='bn'
class OTPRequest(BaseModel): phone: str; purpose: Literal['customer_register','dealer_register','login']='customer_register'; language: Literal['en','bn']='bn'
class OTPVerify(BaseModel): phone: str; purpose: Literal['customer_register','dealer_register','login']='customer_register'; code: str=Field(min_length=4,max_length=8)
class AnalyticsEvent(BaseModel):
    event_type: Literal['page_view','product_view','wishlist','add_to_cart','checkout_started','quantity_request','dealer_interest']
    session_id: str; path: str=''; product_id: Optional[str]=None; product_name: Optional[str]=None; metadata: dict={}
class ProductInput(BaseModel):
    name: str; name_bn: str=''; slug: Optional[str]=None; category_slug: str; brand_slug: str; price: float=Field(gt=0); sale_price: Optional[float]=None
    stock: int=Field(ge=0); weight_kg: float=Field(default=.3,gt=0); colors: list[str]=['Black']; features: list[str]=[]; features_bn: list[str]=[]
    description: str=''; description_bn: str=''; specifications: list[str]=[]; box_contents: list[str]=[]; faq: list[dict]=[]; images: list[str]=[]; video_url: str=''; status: Literal['active','draft','hidden']='active'; featured: bool=False; new_collection: bool=False
class CategoryInput(BaseModel):
    name: str; name_bn: str=''; slug: Optional[str]=None; order: int=0; visible: bool=True; thumbnail_url: str=''
class BrandInput(BaseModel):
    name: str; slug: Optional[str]=None; order: int=0; visible: bool=True; logo_url: str=''
class StaffCreate(BaseModel):
    name: str; email: EmailStr; phone: str=''; role: Literal['admin','sales','inventory','support']; password: str=Field(min_length=8); status: Literal['active','disabled']='active'
class MediaPresign(BaseModel):
    filename: str; content_type: str; folder: Literal['logo','favicon','hero','banner','product','category','dealer','payment']='product'
