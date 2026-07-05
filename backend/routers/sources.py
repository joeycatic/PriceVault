"""Tenant-admin source validation and bounded evidence endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from auth.plan_guard import require_tenant_admin_from_header
from db import queries
from models.schemas import SourceValidationUpdate
from routers.audit import record_audit_event


router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("/{source_id}/validation")
async def get_validation(
    source_id: str, tenant: dict = Depends(require_tenant_admin_from_header)
) -> dict:
    mapping = await queries.get_product_mapping(tenant["id"], source_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Preisquelle nicht gefunden")
    policy, snapshot = await queries.get_source_policy(tenant["id"], source_id), await queries.get_latest_source_snapshot(tenant["id"], source_id)
    return {
        "source_id": source_id,
        "expected_currency": mapping.get("expected_currency"),
        "expected_variant": mapping.get("expected_variant"),
        "validation_state": mapping.get("validation_state", "unvalidated"),
        "validation_notes": mapping.get("validation_notes"),
        "health_status": mapping.get("health_status"),
        "policy": policy,
        "latest_evidence": snapshot,
    }


@router.patch("/{source_id}/validation")
async def update_validation(
    source_id: str, body: SourceValidationUpdate,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    mapping = await queries.update_product_mapping(
        tenant["id"], source_id, body.model_dump(exclude_unset=True, mode="json")
    )
    if not mapping:
        raise HTTPException(status_code=404, detail="Preisquelle nicht gefunden")
    await record_audit_event(
        tenant, action=f"source.validation.{body.validation_state}",
        resource_type="competitor_product", resource_id=source_id,
        metadata={"expected_currency": body.expected_currency, "expected_variant": body.expected_variant},
    )
    return mapping
