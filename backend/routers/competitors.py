"""Tenant-scoped competitor CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from db import queries
from models.schemas import CompetitorCreate, CompetitorUpdate
from routers import get_tenant


router = APIRouter(prefix="/competitors", tags=["competitors"])


@router.get("")
async def list_all(tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_competitors(tenant_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: CompetitorCreate, tenant_id: str = Depends(get_tenant)) -> dict:
    return await queries.create_competitor(tenant_id, body.model_dump(mode="json"))


@router.get("/{competitor_id}")
async def get_one(competitor_id: str, tenant_id: str = Depends(get_tenant)) -> dict:
    competitor = await queries.get_competitor(tenant_id, competitor_id)
    if not competitor:
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    return competitor


@router.patch("/{competitor_id}")
async def update(
    competitor_id: str, body: CompetitorUpdate, tenant_id: str = Depends(get_tenant)
) -> dict:
    competitor = await queries.update_competitor(
        tenant_id, competitor_id, body.model_dump(exclude_unset=True, mode="json")
    )
    if not competitor:
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    return competitor


@router.delete("/{competitor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(competitor_id: str, tenant_id: str = Depends(get_tenant)) -> Response:
    if not await queries.soft_delete_competitor(tenant_id, competitor_id):
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

