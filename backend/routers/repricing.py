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


def _assert_automatic_plan(tenant: dict, approval_mode: str | None) -> None:
    if approval_mode == "automatic" and tenant.get("plan") != "agency":
        raise HTTPException(
            status_code=403,
            detail="Automatische Preisänderungen sind im Agency-Plan verfügbar",
        )


async def _assert_competitor_scope(tenant_id: str, competitor_ids: list[str] | None) -> None:
    if not competitor_ids:
        return
    known = {competitor["id"] for competitor in await queries.list_competitors(tenant_id)}
    unknown = set(competitor_ids) - known
    if unknown:
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")


@router.get("/rules")
async def list_rules(tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_repricing_rules(tenant_id)


@router.post("/rules", status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: RepricingRuleCreate,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    tenant_id = tenant["id"]
    _assert_automatic_plan(tenant, body.approval_mode)
    if body.product_id and not await queries.get_product(tenant_id, body.product_id):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    if body.variant_id:
        variant = await queries.get_product_variant(tenant_id, body.variant_id)
        if not variant or (body.product_id and variant["product_id"] != body.product_id):
            raise HTTPException(status_code=404, detail="Variante nicht gefunden")
    await _assert_competitor_scope(tenant_id, body.competitor_ids)
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
    _assert_automatic_plan(tenant, body.approval_mode)
    await _assert_competitor_scope(tenant["id"], body.competitor_ids)
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


@router.get("/changes")
async def list_changes(tenant: dict = Depends(require_tenant_admin_from_header)) -> list[dict]:
    return await queries.list_repricing_changes(tenant["id"])


@router.post("/changes/{change_id}/rollback")
async def rollback_change(
    change_id: str, tenant: dict = Depends(require_tenant_admin_from_header)
) -> dict:
    change = await queries.get_repricing_change(tenant["id"], change_id)
    if not change:
        raise HTTPException(status_code=404, detail="Preisänderung nicht gefunden")
    if change.get("actor_type") == "automatic":
        raise HTTPException(status_code=403, detail="Automatische Änderungen dürfen nur Platform-Operatoren zurücksetzen")
    try:
        result = await RepricingAgent().rollback(tenant["id"], change, actor_id=tenant.get("_actor_user_id"))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await record_audit_event(
        tenant, action="repricing.change.rolled_back", resource_type="repricing_change", resource_id=change_id,
    )
    return result


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
        writeback_status = await RepricingAgent().apply(
            tenant["id"],
            suggestion,
            actor_type="user",
            actor_id=tenant.get("_actor_user_id") or tenant.get("user_id"),
        )
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
