"""MAP (minimum advertised price) violation register."""

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from auth.plan_guard import require_plan, require_tenant_admin_from_header
from db import queries
from models.schemas import MapViolationUpdate
from routers import get_tenant
from routers.audit import record_audit_event


router = APIRouter(
    prefix="/map",
    tags=["map"],
    dependencies=[Depends(require_plan("pro"))],
)


@router.get("/violations")
async def list_violations(
    violation_status: str = Query(
        default="open",
        alias="status",
        pattern="^(open|acknowledged|resolved|all)$",
    ),
    tenant_id: str = Depends(get_tenant),
) -> list[dict]:
    return await queries.list_map_violations(tenant_id, violation_status)


@router.patch("/violations/{violation_id}")
async def update_violation(
    violation_id: str,
    body: MapViolationUpdate,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    values: dict = {"status": body.status}
    if body.status == "resolved":
        values["resolved_at"] = datetime.now(timezone.utc).isoformat()
    updated = await queries.update_map_violation(tenant["id"], violation_id, values)
    if not updated:
        raise HTTPException(status_code=404, detail="MAP-Verstoß nicht gefunden")
    await record_audit_event(
        tenant,
        action="map_violation.updated",
        resource_type="map_violation",
        resource_id=violation_id,
        metadata={"status": body.status},
    )
    return updated


@router.get("/violations/export")
async def export_violations(
    violation_status: str = Query(
        default="open",
        alias="status",
        pattern="^(open|acknowledged|resolved|all)$",
    ),
    tenant_id: str = Depends(get_tenant),
) -> StreamingResponse:
    rows = await queries.list_map_violations(tenant_id, violation_status)
    output = io.StringIO()
    fieldnames = [
        "detected_at",
        "product",
        "variant",
        "competitor",
        "url",
        "map_price",
        "advertised_price",
        "status",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        mapping = row.get("competitor_products") or {}
        competitor = mapping.get("competitors") or {}
        writer.writerow(
            {
                "detected_at": row.get("detected_at"),
                "product": (row.get("products") or {}).get("name"),
                "variant": (row.get("product_variants") or {}).get("name"),
                "competitor": competitor.get("shop_name"),
                "url": mapping.get("competitor_url"),
                "map_price": row.get("map_price"),
                "advertised_price": row.get("advertised_price"),
                "status": row.get("status"),
            }
        )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=map_violations.csv"},
    )
