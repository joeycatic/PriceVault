"""API-key authenticated integration endpoints."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from auth.api_key_middleware import get_api_key_tenant
from db import queries


router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/prices/latest")
async def latest_prices(
    limit: int = Query(default=100, ge=1, le=500),
    tenant: dict = Depends(get_api_key_tenant),
) -> list[dict]:
    rows = await queries.get_latest_prices(tenant["id"])
    return rows[:limit]


@router.get("/products")
async def products(
    active_only: bool = Query(default=True),
    tenant: dict = Depends(get_api_key_tenant),
) -> list[dict]:
    return await queries.list_products(tenant["id"], active_only=active_only)


@router.get("/competitors")
async def competitors(
    active_only: bool = Query(default=True),
    tenant: dict = Depends(get_api_key_tenant),
) -> list[dict]:
    return await queries.list_competitors(tenant["id"], active_only=active_only)


@router.get("/snapshots")
async def snapshots(
    competitor_product_id: str,
    days: int = Query(default=30, ge=1, le=365),
    tenant: dict = Depends(get_api_key_tenant),
) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return await queries.get_snapshot_history(tenant["id"], competitor_product_id, since)


@router.get("/alerts")
async def alerts(
    active_only: bool = Query(default=True),
    tenant: dict = Depends(get_api_key_tenant),
) -> list[dict]:
    return await queries.list_alerts(tenant["id"], active_only=active_only)


@router.get("/exports")
async def exports(tenant: dict = Depends(get_api_key_tenant)) -> dict:
    return {
        "csv": "/export/csv?competitor_product_id={competitor_product_id}&days=30",
        "pdf": "/export/pdf?competitor_product_id={competitor_product_id}&days=30",
        "tenant_id": tenant["id"],
    }
