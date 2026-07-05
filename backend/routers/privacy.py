"""Tenant data export and deletion request endpoints."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies import get_current_tenant
from db import queries
from models.schemas import PrivacyRequestCreate
from routers.audit import record_audit_event


router = APIRouter(prefix="/privacy", tags=["privacy"])


@router.get("/requests")
async def list_requests(
    limit: int = Query(default=50, ge=1, le=200),
    tenant: dict = Depends(get_current_tenant),
) -> list[dict]:
    return await queries.list_privacy_requests(tenant["id"], limit)


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def create_request(
    body: PrivacyRequestCreate,
    tenant: dict = Depends(get_current_tenant),
) -> dict:
    if body.request_type == "deletion" and tenant.get("_role", "owner") != "owner":
        raise HTTPException(status_code=403, detail="Nur Owner dürfen Löschanfragen stellen")

    metadata = {}
    if body.request_type == "export":
        products = await queries.list_products(tenant["id"])
        competitors = await queries.list_competitors(tenant["id"])
        mappings = await queries.list_all_mappings(tenant["id"])
        metadata = {
            "products": len(products),
            "competitors": len(competitors),
            "price_sources": len(mappings),
            "available_exports": ["/export/csv", "/export/pdf"],
        }

    status_value = "requested"
    scheduled_for = None
    if body.request_type == "deletion":
        expected = f"DELETE {tenant['shop_name']}"
        if body.confirmation_text != expected:
            raise HTTPException(
                status_code=400,
                detail=f"Bitte bestätige mit: {expected}",
            )
        status_value = "cooling_off"
        scheduled_for = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()

    request = await queries.create_privacy_request(
        tenant["id"],
        {
            "user_id": tenant.get("_actor_user_id"),
            "request_type": body.request_type,
            "status": status_value,
            "confirmed_at": datetime.now(timezone.utc).isoformat() if body.request_type == "deletion" else None,
            "scheduled_for": scheduled_for,
            "receipt_email": tenant.get("_email") if body.request_type == "deletion" else None,
            "confirmation_text": body.confirmation_text,
            "export_metadata": metadata,
        },
    )
    await record_audit_event(
        tenant,
        action=f"privacy.{body.request_type}.requested",
        resource_type="privacy_request",
        resource_id=request.get("id"),
        metadata={"status": status_value},
    )
    return request


@router.post("/requests/{request_id}/cancel")
async def cancel_deletion_request(
    request_id: str,
    tenant: dict = Depends(get_current_tenant),
) -> dict:
    if tenant.get("_role", "owner") != "owner":
        raise HTTPException(status_code=403, detail="Nur Owner dürfen Löschanfragen stornieren")
    requests = await queries.list_privacy_requests(tenant["id"], 200)
    current = next((item for item in requests if item["id"] == request_id), None)
    if not current:
        raise HTTPException(status_code=404, detail="Datenschutzanfrage nicht gefunden")
    if current["request_type"] != "deletion" or current["status"] not in {"cooling_off", "scheduled"}:
        raise HTTPException(status_code=409, detail="Diese Löschanfrage kann nicht mehr storniert werden")
    updated = await queries.update_privacy_request(
        tenant["id"], request_id, {"status": "canceled", "canceled_at": datetime.now(timezone.utc).isoformat()}
    )
    await record_audit_event(
        tenant,
        action="privacy.deletion.canceled",
        resource_type="privacy_request",
        resource_id=request_id,
    )
    return updated or current
