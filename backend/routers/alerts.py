"""Tenant-scoped alert rule and event endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from auth.dependencies import get_current_tenant
from auth.plan_guard import assert_plan_capacity
from db import queries
from models.schemas import AlertCreate, AlertUpdate
from routers import get_tenant


router = APIRouter(prefix="/alerts", tags=["alerts"])


STOCK_CONDITIONS = {"out_of_stock", "back_in_stock"}


def _alert_values(body: AlertCreate | AlertUpdate, *, partial: bool = False) -> dict:
    values = body.model_dump(exclude_unset=partial, mode="json")
    condition = values.get("condition")
    if condition in STOCK_CONDITIONS:
        values["threshold"] = None
    elif condition and values.get("threshold") is None:
        raise HTTPException(status_code=422, detail="Grenzwert ist für diese Regel erforderlich")
    return values


@router.get("")
async def list_all(tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_alerts(tenant_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: AlertCreate, tenant: dict = Depends(get_current_tenant)) -> dict:
    tenant_id = tenant["id"]
    if body.product_id and not await queries.get_product(tenant_id, body.product_id):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    if body.competitor_id and not await queries.get_competitor(tenant_id, body.competitor_id):
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    active_count = await queries.count_active_alerts(tenant_id)
    assert_plan_capacity(tenant.get("plan"), "alerts", active_count)
    return await queries.create_alert(tenant_id, _alert_values(body))


@router.patch("/{alert_id}")
async def update(alert_id: str, body: AlertUpdate, tenant_id: str = Depends(get_tenant)) -> dict:
    if body.active is True:
        current = await queries.get_alert(tenant_id, alert_id)
        if not current:
            raise HTTPException(status_code=404, detail="Preisalarm nicht gefunden")
        if not current.get("active", True):
            tenant = await queries.get_tenant_by_id(tenant_id)
            active_count = await queries.count_active_alerts(tenant_id)
            assert_plan_capacity(tenant.get("plan") if tenant else None, "alerts", active_count)
    alert = await queries.update_alert(tenant_id, alert_id, _alert_values(body, partial=True))
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


@router.get("/deliveries")
async def deliveries(
    limit: int = Query(default=100, ge=1, le=500), tenant_id: str = Depends(get_tenant)
) -> list[dict]:
    return await queries.list_alert_channel_deliveries(tenant_id, limit)
