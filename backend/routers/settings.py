"""Tenant settings API."""

from fastapi import APIRouter, Depends, HTTPException

from auth.dependencies import get_current_tenant
from auth.plan_guard import require_tenant_admin
from db import queries
from models.schemas import TenantSettingsUpdate
from routers.audit import record_audit_event


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
async def get_settings(tenant: dict = Depends(get_current_tenant)) -> dict:
    return {
        key: tenant.get(key)
        for key in (
            "id",
            "shop_name",
            "shop_url",
            "plan",
            "timezone",
            "locale",
            "default_currency",
            "default_scrape_freq_h",
            "invoice_email",
            "vat_id",
            "notification_defaults",
            "activation_state",
            "subscription_status",
            "subscription_plan",
            "subscription_current_period_end",
            "subscription_cancel_at_period_end",
            "cancellation_effective_at",
            "failed_payment_count",
            "last_payment_error",
            "next_payment_retry_at",
        )
    }


@router.patch("")
async def update_settings(
    body: TenantSettingsUpdate, tenant: dict = Depends(require_tenant_admin)
) -> dict:
    values = body.model_dump(exclude_unset=True, mode="json")
    if not values:
        return await get_settings(tenant)
    updated = await queries.update_tenant(tenant["id"], values)
    if not updated:
        raise HTTPException(status_code=404, detail="Mandant nicht gefunden")
    await record_audit_event(
        {**tenant, **updated},
        action="settings.updated",
        resource_type="tenant",
        resource_id=tenant["id"],
        metadata={"fields": sorted(values.keys())},
    )
    return {
        key: updated.get(key)
        for key in (
            "id",
            "shop_name",
            "shop_url",
            "plan",
            "timezone",
            "locale",
            "default_currency",
            "default_scrape_freq_h",
            "invoice_email",
            "vat_id",
            "notification_defaults",
            "activation_state",
            "subscription_status",
            "subscription_plan",
            "subscription_current_period_end",
            "subscription_cancel_at_period_end",
            "cancellation_effective_at",
            "failed_payment_count",
            "last_payment_error",
            "next_payment_retry_at",
        )
    }
