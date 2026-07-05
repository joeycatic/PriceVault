"""Tenant-scoped competitor CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from agents.store_recommender import recommend_stores
from auth.plan_guard import assert_plan_capacity, assert_scrape_frequency, require_tenant_admin_from_header
from db import queries
from models.schemas import CompetitorCreate, CompetitorUpdate
from routers import get_tenant
from routers.audit import record_audit_event


router = APIRouter(prefix="/competitors", tags=["competitors"])


@router.get("")
async def list_all(tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_competitors(tenant_id)


@router.get("/recommendations")
async def recommendations(
    limit: int = Query(default=8, ge=1, le=20),
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    products = await queries.list_products(tenant["id"], active_only=True)
    competitors = await queries.list_competitors(tenant["id"], active_only=True)
    return {
        "recommendations": recommend_stores(
            tenant=tenant,
            products=products,
            competitors=competitors,
            limit=limit,
        )
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: CompetitorCreate, tenant: dict = Depends(require_tenant_admin_from_header)) -> dict:
    assert_scrape_frequency(tenant.get("plan"), body.scrape_freq_h)
    active_count = await queries.count_active_competitors(tenant["id"])
    assert_plan_capacity(tenant.get("plan"), "competitors", active_count)
    competitor = await queries.create_competitor(tenant["id"], body.model_dump(mode="json"))
    await record_audit_event(
        tenant,
        action="competitor.created",
        resource_type="competitor",
        resource_id=competitor.get("id"),
        metadata={"shop_name": competitor.get("shop_name")},
    )
    return competitor


@router.get("/{competitor_id}")
async def get_one(competitor_id: str, tenant_id: str = Depends(get_tenant)) -> dict:
    competitor = await queries.get_competitor(tenant_id, competitor_id)
    if not competitor:
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    return competitor


@router.patch("/{competitor_id}")
async def update(
    competitor_id: str, body: CompetitorUpdate, tenant: dict = Depends(require_tenant_admin_from_header)
) -> dict:
    if body.scrape_freq_h is not None:
        assert_scrape_frequency(tenant.get("plan"), body.scrape_freq_h)
    competitor = await queries.update_competitor(
        tenant["id"], competitor_id, body.model_dump(exclude_unset=True, mode="json")
    )
    if not competitor:
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    await record_audit_event(
        tenant,
        action="competitor.updated",
        resource_type="competitor",
        resource_id=competitor_id,
        metadata={"fields": sorted(body.model_dump(exclude_unset=True).keys())},
    )
    return competitor


@router.delete("/{competitor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(competitor_id: str, tenant: dict = Depends(require_tenant_admin_from_header)) -> Response:
    if not await queries.soft_delete_competitor(tenant["id"], competitor_id):
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    await record_audit_event(
        tenant,
        action="competitor.deleted",
        resource_type="competitor",
        resource_id=competitor_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
