from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore', case_sensitive=False)
    app_env: str = 'production'
    app_name: str = 'EMXIN Technologies'
    app_secret: str = 'change-me'
    frontend_url: str = 'http://localhost:4310'
    admin_url: str = 'http://localhost:4320'
    backend_public_url: str = 'http://localhost:8430'
    cors_allowed_origins: str = 'http://localhost:4310,http://localhost:4320'
    trusted_hosts: str = 'localhost,127.0.0.1'
    mongodb_uri: str
    mongodb_db_name: str = 'emxin'
    initial_admin_email: str = 'owner@example.com'
    initial_admin_password: str = 'change-me'
    jwt_expire_minutes: int = 720          # Admin / staff sessions (12 h)
    customer_session_days: int = 30         # customers & dealers stay logged in on their device (saves OTP SMS)

    aws_region: str = 'ap-southeast-1'
    aws_access_key_id: str = ''
    aws_secret_access_key: str = ''
    aws_s3_bucket: str = ''
    aws_cloudfront_domain: str = ''
    aws_cdn_base_url: str = ''
    aws_s3_prefix: str = 'media'
    s3_presigned_upload_expire_seconds: int = 900
    # Server-side video re-encode after upload (needs ffmpeg in the image). CRF 20 = near-lossless, 23 = default, 26 = smaller.
    video_compression_enabled: bool = True
    video_crf: int = 23

    paystation_enabled: bool = False
    paystation_env: str = 'sandbox'
    paystation_sandbox_base_url: str = 'https://sandbox.paystation.com.bd'
    paystation_live_base_url: str = 'https://api.paystation.com.bd'
    paystation_merchant_id: str = ''
    paystation_password: str = ''
    paystation_initiate_path: str = '/initiate-payment'
    paystation_status_path: str = '/transaction-status'
    paystation_ipn_url: str = ''
    paystation_callback_url: str = ''
    paystation_pay_with_charge: int = 0
    digital_payment_discount_percent: float = 2

    # Optional manual/fallback collection accounts. These do NOT control PayStation settlement.
    payment_bkash_number: str = ''
    payment_bkash_account_type: str = 'personal'
    payment_nagad_number: str = ''
    payment_nagad_account_type: str = 'personal'
    payment_bank_name: str = 'City Bank'
    payment_bank_account_name: str = ''
    payment_bank_account_number: str = ''
    payment_bank_branch: str = ''
    payment_bank_routing_number: str = ''

    # ---- SMS / OTP: BulkSMSBD (the only SMS provider) ----
    bulksmsbd_api_url: str = 'http://bulksmsbd.net/api/smsapi'
    bulksmsbd_api_key: str = ''
    bulksmsbd_sender_id: str = ''
    # {OTP}, {MINUTES} and {DOMAIN} are filled in. Keep it plain English/ASCII (no ৳, emoji or curly quotes) so it is 1 normal SMS, not Unicode.
    # The last line lets Android Chrome / iPhone fill the code in automatically (WebOTP); {DOMAIN} = the storefront host.
    otp_sms_template: str = 'Your EMXIN verification code is {OTP}. Valid for {MINUTES} minutes. Do not share this code with anyone.\n\n@{DOMAIN} #{OTP}'
    otp_max_per_phone_hour: int = 5      # sends (incl. resends) per number per hour
    otp_max_per_ip_hour: int = 15        # sends per visitor IP per hour (stops SMS pumping)
    otp_max_per_day: int = 300           # whole-site daily cap — protects your SMS balance
    otp_verification_valid_minutes: int = 30  # a verified OTP must be used to register/login within this time
    otp_expire_seconds: int = 300
    otp_resend_seconds: int = 60
    otp_max_attempts: int = 5
    otp_expose_code_in_test: bool = True

    dhaka_delivery_charge: float = 70
    outside_dhaka_delivery_charge: float = 130
    estimated_shipping_from_qty: int = 6
    extra_shipping_per_kg: float = 0
    bulk_threshold_qty: int = 20
    bulk_discount_percent: float = 5
    bulk_advance_percent: float = 50
    enable_first_party_analytics: bool = True
    analytics_session_ttl_days: int = 30

    courier_default: str = 'steadfast'
    steadfast_enabled: bool = False
    steadfast_base_url: str = ''
    steadfast_create_order_path: str = ''
    steadfast_status_path: str = ''
    steadfast_api_key: str = ''
    steadfast_secret_key: str = ''
    steadfast_webhook_secret: str = ''
    pathao_enabled: bool = False
    pathao_base_url: str = ''
    pathao_token_path: str = ''
    pathao_create_order_path: str = ''
    pathao_status_path: str = ''
    pathao_client_id: str = ''
    pathao_client_secret: str = ''
    pathao_username: str = ''
    pathao_password: str = ''
    pathao_webhook_secret: str = ''

    @property
    def origins(self):
        return [x.strip() for x in self.cors_allowed_origins.split(',') if x.strip()]
    @property
    def paystation_base_url(self):
        return self.paystation_live_base_url if self.paystation_env.lower() == 'live' else self.paystation_sandbox_base_url
    @property
    def sms_enabled(self) -> bool:
        return bool(self.bulksmsbd_api_key)
    @property
    def site_domain(self) -> str:
        from urllib.parse import urlparse
        return urlparse(self.frontend_url).hostname or 'localhost'

@lru_cache
def get_settings():
    return Settings()
