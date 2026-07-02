"""Request and response models for the FastAPI surface."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, field_validator

from security.urls import normalize_shopify_domain


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ScrapeRunRequest(APIModel):
    tenant_id: str
    competitor_product_ids: list[str] | None = None


class ScrapeTestRequest(APIModel):
    url: HttpUrl
    selector_price: str | None = None
    selector_stock: str | None = None


class MatchSearchRequest(APIModel):
    product_name: str = Field(min_length=2)
    competitor_id: str


class CompetitorCreate(APIModel):
    shop_name: str = Field(min_length=1)
    base_url: HttpUrl
    selector_price: str | None = None
    selector_stock: str | None = None
    scrape_freq_h: int = Field(default=12, ge=1, le=168)
    notes: str | None = None


class CompetitorUpdate(APIModel):
    shop_name: str | None = Field(default=None, min_length=1)
    base_url: HttpUrl | None = None
    selector_price: str | None = None
    selector_stock: str | None = None
    scrape_freq_h: int | None = Field(default=None, ge=1, le=168)
    notes: str | None = None
    active: bool | None = None


class ProductCreate(APIModel):
    name: str = Field(min_length=1)
    our_sku: str | None = None
    our_price: float | None = Field(default=None, ge=0)
    our_currency: str = "EUR"


class ProductUpdate(APIModel):
    name: str | None = None
    our_sku: str | None = None
    our_price: float | None = Field(default=None, ge=0)
    active: bool | None = None


class ProductMappingCreate(APIModel):
    competitor_id: str
    competitor_url: HttpUrl
    competitor_sku: str | None = None
    selector_price: str | None = None


AlertCondition = Literal["below_pct", "above_pct", "below_abs", "above_abs"]


class AlertCreate(APIModel):
    product_id: str | None = None
    competitor_id: str | None = None
    condition: AlertCondition
    threshold: float = Field(gt=0)
    notify_email: EmailStr
    cooldown_h: int = Field(default=24, ge=1, le=720)


class AlertUpdate(APIModel):
    product_id: str | None = None
    competitor_id: str | None = None
    condition: AlertCondition | None = None
    threshold: float | None = Field(default=None, gt=0)
    notify_email: EmailStr | None = None
    active: bool | None = None
    cooldown_h: int | None = Field(default=None, ge=1, le=720)


class ScrapeResultResponse(APIModel):
    competitor_product_id: str
    price: float | None
    currency: str
    in_stock: bool | None
    raw_price_text: str | None
    scrape_ok: bool
    error_msg: str | None
    scraped_at: datetime


class BillingCheckoutRequest(APIModel):
    plan: Literal["pro", "agency"]


class APIKeyCreate(APIModel):
    name: str = Field(min_length=1, max_length=80)


class AlertChannelCreate(APIModel):
    type: Literal["webhook", "slack"]
    config: dict[str, Any]


class AlertChannelUpdate(APIModel):
    active: bool | None = None
    config: dict[str, Any] | None = None


class TeamInviteRequest(APIModel):
    email: EmailStr
    role: Literal["admin", "member"] = "member"


class ShopifyImportRequest(APIModel):
    shop_domain: str = Field(min_length=3)
    access_token: str = Field(min_length=8)

    @field_validator("shop_domain")
    @classmethod
    def validate_shop_domain(cls, value: str) -> str:
        return normalize_shopify_domain(value)


class OnboardingSequenceRequest(APIModel):
    email: EmailStr
