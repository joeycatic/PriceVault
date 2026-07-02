"""API-key authenticated integration endpoints."""

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
