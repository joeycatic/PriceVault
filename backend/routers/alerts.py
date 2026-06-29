"""Tenant-scoped alert rule and event endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from db import queries
from models.schemas import AlertCreate, AlertUpdate
from routers import get_tenant


router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
async def list_all(tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_alerts(tenant_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: AlertCreate, tenant_id: str = Depends(get_tenant)) -> dict:
    return await queries.create_alert(tenant_id, body.model_dump(mode="json"))


@router.patch("/{alert_id}")
async def update(alert_id: str, body: AlertUpdate, tenant_id: str = Depends(get_tenant)) -> dict:
    alert = await queries.update_alert(
        tenant_id, alert_id, body.model_dump(exclude_unset=True, mode="json")
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Preisalarm nicht gefunden")
    return alert


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(alert_id: str, tenant_id: str = Depends(get_tenant)) -> Response:
    if not await queries.delete_alert(tenant_id, alert_id):
        raise HTTPException(status_code=404, detail="Preisalarm nicht gefunden")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/events")
async def events(
    limit: int = Query(default=50, ge=1, le=200), tenant_id: str = Depends(get_tenant)
) -> list[dict]:
    return await queries.list_alert_events(tenant_id, limit)

