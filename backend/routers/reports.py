"""Customer report APIs and report schedule management."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from auth.dependencies import get_current_tenant
from auth.plan_guard import require_plan_admin
from db import queries
from models.schemas import ReportScheduleCreate, ReportScheduleUpdate
from routers.audit import record_audit_event


router = APIRouter(tags=["reports"])


def _price_metrics(rows: list[dict]) -> dict[str, int]:
    active = [row for row in rows if row.get("competitor_price") is not None]
    return {
        "sources": len(rows),
        "prices_found": len(active),
        "undercut": len([row for row in rows if float(row.get("delta_pct") or 0) < 0]),
        "unavailable": len([row for row in rows if row.get("in_stock") is False]),
    }


@router.get("/reports/summary")
async def report_summary(tenant: dict = Depends(get_current_tenant)) -> dict:
    rows = await queries.get_latest_prices(tenant["id"])
    return {"metrics": _price_metrics(rows), "latest_prices": rows[:100]}


@router.get("/reports/products/{product_id}")
async def product_report(
    product_id: str,
    days: int = Query(default=30, ge=1, le=365),
    tenant: dict = Depends(get_current_tenant),
) -> dict:
    product = await queries.get_product(tenant["id"], product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    latest = [
        row for row in await queries.get_latest_prices(tenant["id"])
        if row.get("product_id") == product_id
    ]
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    history = []
    for row in latest:
        history.extend(
            await queries.get_snapshot_history(
                tenant["id"], row["competitor_product_id"], since
            )
        )
    return {
        "product": product,
        "metrics": _price_metrics(latest),
        "latest_prices": latest,
        "history": sorted(history, key=lambda item: item.get("scraped_at") or ""),
    }


@router.get("/reports/competitors/{competitor_id}")
async def competitor_report(
    competitor_id: str,
    days: int = Query(default=30, ge=1, le=365),
    tenant: dict = Depends(get_current_tenant),
) -> dict:
    competitor = await queries.get_competitor(tenant["id"], competitor_id)
    if not competitor:
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    latest = [
        row for row in await queries.get_latest_prices(tenant["id"])
        if row.get("competitor_id") == competitor_id
    ]
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    history = []
    for row in latest:
        history.extend(
            await queries.get_snapshot_history(
                tenant["id"], row["competitor_product_id"], since
            )
        )
    return {
        "competitor": competitor,
        "metrics": _price_metrics(latest),
        "latest_prices": latest,
        "history": sorted(history, key=lambda item: item.get("scraped_at") or ""),
    }


@router.get("/report-schedules")
async def list_schedules(tenant: dict = Depends(require_plan_admin("pro"))) -> list[dict]:
    return await queries.list_report_schedules(tenant["id"])


@router.post("/report-schedules", status_code=status.HTTP_201_CREATED)
async def create_schedule(
    body: ReportScheduleCreate, tenant: dict = Depends(require_plan_admin("pro"))
) -> dict:
    schedule = await queries.create_report_schedule(tenant["id"], body.model_dump(mode="json"))
    await record_audit_event(
        tenant,
        action="report_schedule.created",
        resource_type="report_schedule",
        resource_id=schedule.get("id"),
        metadata={"cadence": body.cadence, "include_csv": body.include_csv},
    )
    return schedule


@router.patch("/report-schedules/{schedule_id}")
async def update_schedule(
    schedule_id: str,
    body: ReportScheduleUpdate,
    tenant: dict = Depends(require_plan_admin("pro")),
) -> dict:
    schedule = await queries.update_report_schedule(
        tenant["id"], schedule_id, body.model_dump(exclude_unset=True, mode="json")
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Report-Zeitplan nicht gefunden")
    await record_audit_event(
        tenant,
        action="report_schedule.updated",
        resource_type="report_schedule",
        resource_id=schedule_id,
        metadata={"fields": sorted(body.model_dump(exclude_unset=True).keys())},
    )
    return schedule


@router.delete("/report-schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: str, tenant: dict = Depends(require_plan_admin("pro"))
) -> Response:
    if not await queries.delete_report_schedule(tenant["id"], schedule_id):
        raise HTTPException(status_code=404, detail="Report-Zeitplan nicht gefunden")
    await record_audit_event(
        tenant,
        action="report_schedule.deleted",
        resource_type="report_schedule",
        resource_id=schedule_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/report-schedules/{schedule_id}/send-now")
async def send_now(schedule_id: str, tenant: dict = Depends(require_plan_admin("pro"))) -> dict:
    schedule = await queries.get_report_schedule(tenant["id"], schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Report-Zeitplan nicht gefunden")
    run = await queries.create_report_run(
        tenant["id"],
        {
            "schedule_id": schedule_id,
            "status": "queued",
            "recipients": schedule.get("recipients") or [],
            "include_csv": schedule.get("include_csv", False),
            "filters": schedule.get("filters") or {},
        },
    )
    await record_audit_event(
        tenant,
        action="report_schedule.send_now",
        resource_type="report_run",
        resource_id=run.get("id"),
        metadata={"schedule_id": schedule_id},
    )
    return run


@router.get("/report-runs")
async def list_runs(
    limit: int = Query(default=100, ge=1, le=500),
    tenant: dict = Depends(require_plan_admin("pro")),
) -> list[dict]:
    return await queries.list_report_runs(tenant["id"], limit)
