"""Tenant data export and deletion request endpoints."""

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
    if body.request_type == "deletion":
        expected = f"DELETE {tenant['shop_name']}"
        if body.confirmation_text != expected:
            raise HTTPException(
                status_code=400,
                detail=f"Bitte bestätige mit: {expected}",
            )
        status_value = "confirmed"

    request = await queries.create_privacy_request(
        tenant["id"],
        {
            "user_id": tenant.get("_actor_user_id"),
            "request_type": body.request_type,
            "status": status_value,
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
