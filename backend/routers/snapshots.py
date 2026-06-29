"""Read-only latest-price and snapshot history endpoints."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from db import queries
from routers import get_tenant


router = APIRouter(prefix="/snapshots", tags=["snapshots"])


@router.get("/latest")
async def latest(tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.get_latest_prices(tenant_id)


@router.get("/history/{competitor_product_id}")
async def history(
    competitor_product_id: str,
    days: int = Query(default=30, ge=1, le=365),
    tenant_id: str = Depends(get_tenant),
) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return await queries.get_snapshot_history(tenant_id, competitor_product_id, since)

