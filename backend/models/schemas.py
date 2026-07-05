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


class SelectorDetectRequest(APIModel):
    url: HttpUrl


class MatchSearchRequest(APIModel):
    product_name: str = Field(min_length=2)
    competitor_id: str


class MatchSuggestionGenerateRequest(APIModel):
    variant_id: str
    competitor_id: str


class MatchSuggestionGenerateMissingRequest(APIModel):
    competitor_id: str | None = None
    limit: int = Field(default=10, ge=1, le=25)


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


class PublicCatalogDiscoverRequest(APIModel):
    base_url: str = Field(min_length=4, max_length=2048)
    max_products: int = Field(default=50, ge=1, le=250)


class ProductUpdate(APIModel):
    name: str | None = None
    our_sku: str | None = None
    our_price: float | None = Field(default=None, ge=0)
    active: bool | None = None


class ProductVariantCreate(APIModel):
    name: str = Field(default="Standard", min_length=1, max_length=120)
    sku: str | None = Field(default=None, max_length=120)
    gtin: str | None = Field(default=None, pattern=r"^\d{8}(?:\d{4,6})?$")
    attributes: dict[str, str] = Field(default_factory=dict)
    our_price: float | None = Field(default=None, ge=0)
    cost_price: float | None = Field(default=None, ge=0)
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    is_default: bool = False


class ProductVariantUpdate(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    sku: str | None = Field(default=None, max_length=120)
    gtin: str | None = Field(default=None, pattern=r"^\d{8}(?:\d{4,6})?$")
    attributes: dict[str, str] | None = None
    our_price: float | None = Field(default=None, ge=0)
    cost_price: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    is_default: bool | None = None
    active: bool | None = None


class ProductMappingCreate(APIModel):
    competitor_id: str
    variant_id: str
    competitor_url: HttpUrl
    competitor_sku: str | None = None
    selector_price: str | None = None
    expected_currency: str | None = Field(default=None, min_length=3, max_length=3)
    expected_variant: str | None = Field(default=None, max_length=160)
    customer_authorized: bool = False


class ProductMappingRepair(APIModel):
    competitor_url: HttpUrl | None = None
    selector_price: str | None = None
    selector_stock: str | None = None
    expected_currency: str | None = Field(default=None, min_length=3, max_length=3)
    expected_variant: str | None = Field(default=None, max_length=160)
    validation_state: Literal["unvalidated", "validated", "rejected"] | None = None
    validation_notes: str | None = Field(default=None, max_length=1000)


class RepricingRuleCreate(APIModel):
    name: str = Field(min_length=1, max_length=120)
    strategy: Literal["match_lowest", "beat_percent"]
    beat_by_pct: float = Field(default=0, ge=0, le=50)
    min_margin_pct: float = Field(ge=0, le=500)
    approval_mode: Literal["manual", "automatic"] = "manual"
    max_change_pct: float = Field(default=10, ge=0.1, le=100)
    require_healthy_sources: bool = True
    product_id: str | None = None
    variant_id: str | None = None


class RepricingRuleUpdate(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    strategy: Literal["match_lowest", "beat_percent"] | None = None
    beat_by_pct: float | None = Field(default=None, ge=0, le=50)
    min_margin_pct: float | None = Field(default=None, ge=0, le=500)
    approval_mode: Literal["manual", "automatic"] | None = None
    max_change_pct: float | None = Field(default=None, ge=0.1, le=100)
    require_healthy_sources: bool | None = None
    active: bool | None = None


AlertCondition = Literal[
    "below_pct",
    "above_pct",
    "below_abs",
    "above_abs",
    "out_of_stock",
    "back_in_stock",
    "undercut_abs",
    "price_drop",
    "price_rise",
    "source_broken",
]


class AlertCreate(APIModel):
    product_id: str | None = None
    competitor_id: str | None = None
    condition: AlertCondition
    threshold: float | None = Field(default=None, gt=0)
    threshold_unit: Literal["percent", "absolute"] = "percent"
    notify_email: EmailStr
    cooldown_h: int = Field(default=24, ge=1, le=720)


class AlertUpdate(APIModel):
    product_id: str | None = None
    competitor_id: str | None = None
    condition: AlertCondition | None = None
    threshold: float | None = Field(default=None, gt=0)
    threshold_unit: Literal["percent", "absolute"] | None = None
    notify_email: EmailStr | None = None
    active: bool | None = None
    cooldown_h: int | None = Field(default=None, ge=1, le=720)


class ScrapeResultResponse(APIModel):
    competitor_product_id: str
    price: float | None
    currency: str | None
    in_stock: bool | None
    raw_price_text: str | None
    scrape_ok: bool
    error_msg: str | None
    scraped_at: datetime
    price_type: Literal["regular", "sale", "member", "unit", "unknown"] = "unknown"
    vat_status: Literal["included", "excluded", "unknown"] = "unknown"
    shipping_status: Literal["included", "excluded", "unknown"] = "unknown"
    variant_evidence: str | None = None
    extraction_method: str = "unknown"
    confidence: float = Field(default=0, ge=0, le=1)
    source_evidence: dict[str, Any] | None = None
    validation_state: Literal["unknown", "valid", "ambiguous", "rejected"] = "unknown"
    validation_reason: str | None = None


class BillingCheckoutRequest(APIModel):
    plan: Literal["pro", "agency"]
    billing_country: str | None = Field(default=None, min_length=2, max_length=2)
    vat_id: str | None = Field(default=None, max_length=40)


class BillingAdjustmentCreate(APIModel):
    tenant_reference: str
    invoice_id: str
    type: Literal["refund", "credit_note", "correction"]
    amount_cents: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=500)
    provider_transaction_id: str | None = Field(default=None, max_length=160)


class BillingRefundRequestCreate(APIModel):
    invoice_id: str
    amount_cents: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=500)


class BillingRefundDecision(APIModel):
    reason: str | None = Field(default=None, max_length=500)


class SourceValidationUpdate(APIModel):
    expected_currency: str | None = Field(default=None, min_length=3, max_length=3)
    expected_variant: str | None = Field(default=None, max_length=160)
    validation_state: Literal["validated", "rejected"]
    validation_notes: str | None = Field(default=None, max_length=1000)


class PublicIncidentWrite(APIModel):
    title: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=3, max_length=4000)
    status: Literal["investigating", "identified", "monitoring", "resolved"]
    severity: Literal["minor", "major", "critical"]
    affected_services: list[str] = Field(default_factory=list, max_length=20)
    started_at: datetime
    resolved_at: datetime | None = None


class CostRateWrite(APIModel):
    cost_eur_per_unit: float = Field(ge=0)


class RecoveryDrillWrite(APIModel):
    environment: str = Field(min_length=2, max_length=100)
    owner: str = Field(min_length=2, max_length=200)
    status: Literal["scheduled", "running", "passed", "failed"]
    rpo_minutes: int | None = Field(default=None, ge=0)
    rto_minutes: int | None = Field(default=None, ge=0)
    evidence_location: str | None = Field(default=None, max_length=2000)
    findings: str | None = Field(default=None, max_length=4000)


class BackupVerificationWrite(APIModel):
    backup_observed_at: datetime
    evidence_location: str = Field(min_length=3, max_length=2000)
    verified_by: str = Field(min_length=2, max_length=200)
    status: Literal["current", "stale", "failed"]


class SecurityIncidentWrite(APIModel):
    severity: Literal["sev1", "sev2", "sev3", "sev4"]
    status: Literal["investigating", "contained", "monitoring", "resolved"]
    title: str = Field(min_length=3, max_length=200)
    commander: str = Field(min_length=2, max_length=200)
    evidence_location: str | None = Field(default=None, max_length=2000)
    customer_notification_status: str = Field(default="not_assessed", max_length=100)
    started_at: datetime
    contained_at: datetime | None = None
    resolved_at: datetime | None = None


class ReconciliationExceptionWrite(APIModel):
    reconciliation_id: str | None = None
    status: Literal["open", "investigating", "resolved", "accepted"] = "open"
    owner: str | None = Field(default=None, max_length=200)
    reason: str = Field(min_length=3, max_length=1000)
    evidence: dict[str, Any] = Field(default_factory=dict)


class SourceRepairAssignmentWrite(APIModel):
    tenant_id: str
    competitor_product_id: str
    owner: str = Field(min_length=2, max_length=200)
    status: Literal["open", "investigating", "repaired", "wont_fix"] = "open"
    notes: str | None = Field(default=None, max_length=2000)


class APIKeyCreate(APIModel):
    name: str = Field(min_length=1, max_length=80)


class AlertChannelCreate(APIModel):
    type: Literal["webhook", "slack"]
    config: dict[str, Any]


class AlertChannelUpdate(APIModel):
    active: bool | None = None
    config: dict[str, Any] | None = None


class AlertChannelTestRequest(APIModel):
    channel_id: str


TeamRole = Literal["owner", "admin", "analyst", "viewer", "billing", "member"]


class TeamInviteRequest(APIModel):
    email: EmailStr
    role: TeamRole = "member"


class TeamMemberUpdate(APIModel):
    role: TeamRole


class TenantSettingsUpdate(APIModel):
    shop_name: str | None = Field(default=None, min_length=1)
    shop_url: HttpUrl | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=80)
    locale: str | None = Field(default=None, min_length=2, max_length=12)
    default_currency: str | None = Field(default=None, min_length=3, max_length=3)
    default_scrape_freq_h: int | None = Field(default=None, ge=1, le=168)
    invoice_email: EmailStr | None = None
    vat_id: str | None = Field(default=None, max_length=40)
    billing_address: dict[str, str] | None = None
    notification_defaults: dict[str, Any] | None = None
    activation_state: dict[str, Any] | None = None


class ReportScheduleCreate(APIModel):
    name: str = Field(min_length=1, max_length=120)
    cadence: Literal["weekly", "monthly"]
    recipients: list[EmailStr] = Field(min_length=1, max_length=10)
    include_csv: bool = False
    filters: dict[str, Any] = Field(default_factory=dict)


class ReportScheduleUpdate(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    cadence: Literal["weekly", "monthly"] | None = None
    recipients: list[EmailStr] | None = Field(default=None, min_length=1, max_length=10)
    include_csv: bool | None = None
    filters: dict[str, Any] | None = None
    active: bool | None = None


class ConnectorSourceCreate(APIModel):
    type: Literal["woocommerce", "feed_csv", "google_merchant"]
    name: str = Field(min_length=1, max_length=120)
    config: dict[str, Any]


class ConnectorSyncRequest(APIModel):
    connector_id: str


class PrivacyRequestCreate(APIModel):
    request_type: Literal["export", "deletion"]
    confirmation_text: str | None = Field(default=None, max_length=200)


class AdminPlanOverride(APIModel):
    plan: Literal["free", "pro", "agency"]
    reason: str = Field(min_length=4, max_length=500)


class SourcePolicyOverride(APIModel):
    override: Literal["allow", "block"]
    reason: str = Field(min_length=3, max_length=500)


class ShopifyImportRequest(APIModel):
    shop_domain: str = Field(min_length=3)
    access_token: str = Field(min_length=8)

    @field_validator("shop_domain")
    @classmethod
    def validate_shop_domain(cls, value: str) -> str:
        return normalize_shopify_domain(value)


class OnboardingSequenceRequest(APIModel):
    email: EmailStr
