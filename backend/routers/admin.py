"""Internal PriceVault support console APIs."""

import os

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies import get_current_tenant
from db import queries
from models.schemas import AdminPlanOverride
from routers.audit import record_audit_event


router = APIRouter(prefix="/admin", tags=["admin"])


def _admin_emails() -> set[str]:
    return {
        email.strip().casefold()
        for email in os.environ.get("PLATFORM_ADMIN_EMAILS", "").split(",")
        if email.strip()
    }


async def require_platform_admin(tenant: dict = Depends(get_current_tenant)) -> dict:
    email = (tenant.get("_email") or "").casefold()
    if not email or email not in _admin_emails():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform-Admin Zugriff erforderlich",
        )
    return tenant


@router.get("/overview")
async def overview(
    limit: int = Query(default=100, ge=1, le=500),
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    del admin_tenant
    return {
        "tenants": await queries.list_tenants(),
        "scrape_jobs": await queries.list_scrape_jobs(limit=limit),
        "report_runs": await queries.list_report_runs(limit=limit),
        "connector_sync_runs": await queries.list_connector_sync_runs(limit=limit),
        "audit_events": await queries.list_audit_events(limit=limit),
    }


@router.get("/tenants")
async def tenants(admin_tenant: dict = Depends(require_platform_admin)) -> list[dict]:
    del admin_tenant
    return await queries.list_tenants()


@router.get("/audit-events")
async def audit_events(
    tenant_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    admin_tenant: dict = Depends(require_platform_admin),
) -> list[dict]:
    del admin_tenant
    return await queries.list_audit_events(tenant_id, limit)


@router.post("/tenants/{tenant_id}/plan")
async def override_plan(
    tenant_id: str,
    body: AdminPlanOverride,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    tenant = await queries.update_tenant(tenant_id, {"plan": body.plan})
    if not tenant:
        raise HTTPException(status_code=404, detail="Mandant nicht gefunden")
    await record_audit_event(
        {**admin_tenant, "id": tenant_id},
        action="support.plan_override",
        resource_type="tenant",
        resource_id=tenant_id,
        metadata={"plan": body.plan, "reason": body.reason},
    )
    return tenant


@router.post("/scrape-jobs/{tenant_id}/{competitor_product_id}/retry")
async def retry_scrape(
    tenant_id: str,
    competitor_product_id: str,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    job = await queries.create_scrape_job(tenant_id, competitor_product_id, "queued")
    await record_audit_event(
        {**admin_tenant, "id": tenant_id},
        action="support.scrape_retry_queued",
        resource_type="scrape_job",
        resource_id=job.get("id"),
        metadata={"competitor_product_id": competitor_product_id},
    )
    return job


@router.post("/connectors/{tenant_id}/{connector_id}/disable")
async def disable_connector(
    tenant_id: str,
    connector_id: str,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    source = await queries.update_connector_source(tenant_id, connector_id, {"active": False})
    if not source:
        raise HTTPException(status_code=404, detail="Connector nicht gefunden")
    await record_audit_event(
        {**admin_tenant, "id": tenant_id},
        action="support.connector_disabled",
        resource_type="connector_source",
        resource_id=connector_id,
    )
    return {key: value for key, value in source.items() if key != "config"}
