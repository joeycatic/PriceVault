"""Manual-approval repricing rules and suggestions."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from agents.repricing_agent import RepricingAgent
from auth.plan_guard import require_tenant_admin_from_header
from db import queries
from models.schemas import RepricingRuleCreate, RepricingRuleUpdate
from routers import get_tenant
from routers.audit import record_audit_event


router = APIRouter(prefix="/repricing", tags=["repricing"])


@router.get("/rules")
async def list_rules(tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_repricing_rules(tenant_id)


@router.post("/rules", status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: RepricingRuleCreate,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    tenant_id = tenant["id"]
    if body.product_id and not await queries.get_product(tenant_id, body.product_id):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    if body.variant_id:
        variant = await queries.get_product_variant(tenant_id, body.variant_id)
        if not variant or (body.product_id and variant["product_id"] != body.product_id):
            raise HTTPException(status_code=404, detail="Variante nicht gefunden")
    values = body.model_dump(mode="json")
    if body.strategy == "match_lowest":
        values["beat_by_pct"] = 0
    rule = await queries.create_repricing_rule(tenant_id, values)
    await record_audit_event(
        tenant,
        action="repricing_rule.created",
        resource_type="repricing_rule",
        resource_id=rule.get("id"),
    )
    return rule


@router.patch("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    body: RepricingRuleUpdate,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    values = body.model_dump(exclude_unset=True, mode="json")
    if body.strategy == "match_lowest":
        values["beat_by_pct"] = 0
    rule = await queries.update_repricing_rule(tenant["id"], rule_id, values)
    if not rule:
        raise HTTPException(status_code=404, detail="Preisregel nicht gefunden")
    return rule


@router.get("/suggestions")
async def list_suggestions(
    suggestion_status: str = Query(default="pending", alias="status", pattern="^(pending|approved|rejected|applied|failed)$"),
    tenant_id: str = Depends(get_tenant),
) -> list[dict]:
    return await queries.list_reprice_suggestions(tenant_id, suggestion_status)


@router.post("/suggestions/generate")
async def generate_suggestions(
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict[str, int]:
    return await RepricingAgent().generate(tenant["id"])


@router.post("/suggestions/{suggestion_id}/approve")
async def approve_suggestion(
    suggestion_id: str,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    suggestion = await queries.get_reprice_suggestion(tenant["id"], suggestion_id)
    if not suggestion:
        raise HTTPException(status_code=404, detail="Preisvorschlag nicht gefunden")
    if suggestion["status"] != "pending":
        raise HTTPException(status_code=409, detail="Preisvorschlag wurde bereits bearbeitet")
    reviewed_at = datetime.now(timezone.utc).isoformat()
    try:
        writeback_status = await RepricingAgent().apply(tenant["id"], suggestion)
    except Exception as exc:
        await queries.update_reprice_suggestion(
            tenant["id"],
            suggestion_id,
            {
                "status": "failed",
                "writeback_status": "failed",
                "writeback_error": str(exc)[:1000],
                "reviewed_by": tenant.get("_actor_user_id") or tenant.get("user_id"),
                "reviewed_at": reviewed_at,
            },
        )
        raise HTTPException(status_code=502, detail=f"Preis konnte nicht angewendet werden: {exc}") from exc
    updated = await queries.update_reprice_suggestion(
        tenant["id"],
        suggestion_id,
        {
            "status": "applied",
            "writeback_status": writeback_status,
            "writeback_error": None,
            "reviewed_by": tenant.get("_actor_user_id") or tenant.get("user_id"),
            "reviewed_at": reviewed_at,
            "applied_at": reviewed_at,
        },
    )
    await record_audit_event(
        tenant,
        action="reprice_suggestion.applied",
        resource_type="reprice_suggestion",
        resource_id=suggestion_id,
        metadata={"suggested_price": suggestion["suggested_price"]},
    )
    return updated or suggestion


@router.post("/suggestions/{suggestion_id}/reject")
async def reject_suggestion(
    suggestion_id: str,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    suggestion = await queries.get_reprice_suggestion(tenant["id"], suggestion_id)
    if not suggestion:
        raise HTTPException(status_code=404, detail="Preisvorschlag nicht gefunden")
    if suggestion["status"] != "pending":
        raise HTTPException(status_code=409, detail="Preisvorschlag wurde bereits bearbeitet")
    updated = await queries.update_reprice_suggestion(
        tenant["id"],
        suggestion_id,
        {
            "status": "rejected",
            "reviewed_by": tenant.get("_actor_user_id") or tenant.get("user_id"),
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return updated or suggestion
