"""Internal PriceVault support console APIs."""

import asyncio
import os
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.dependencies import get_current_tenant
from db import queries
from models.schemas import (
    AdminPlanOverride, BackupVerificationWrite, BillingAdjustmentCreate, BillingRefundDecision,
    CostRateWrite, PublicIncidentWrite, RecoveryDrillWrite, SourcePolicyOverride,
    ReconciliationExceptionWrite, SecurityIncidentWrite, SourceRepairAssignmentWrite,
)
from payments import viva
from routers.audit import record_audit_event


router = APIRouter(prefix="/admin", tags=["admin"])


def _admin_emails() -> set[str]:
    return {
        email.strip().casefold()
        for email in os.environ.get("PLATFORM_ADMIN_EMAILS", "").split(",")
        if email.strip()
    }


async def require_platform_admin(tenant: dict = Depends(get_current_tenant)) -> dict:
    email = (tenant.get("_email") or "").casefold()
    if not email or email not in _admin_emails():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform-Admin Zugriff erforderlich",
        )
    return tenant


async def _optional_overview_rows(
    resource: str,
    loader: Callable[[], Awaitable[list[dict[str, Any]]]],
) -> tuple[list[dict[str, Any]], dict[str, str] | None]:
    try:
        return await loader(), None
    except Exception as exc:
        return [], {
            "resource": resource,
            "code": getattr(exc, "code", None) or type(exc).__name__,
            "message": "Datengruppe ist im aktuellen Schema nicht verfuegbar.",
            "details": str(exc)[:240],
        }


@router.get("/overview")
async def overview(
    limit: int = Query(default=100, ge=1, le=500),
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    del admin_tenant
    scrape_jobs, scrape_jobs_issue = await _optional_overview_rows(
        "scrape_jobs",
        lambda: queries.list_scrape_jobs(limit=limit),
    )
    report_runs, report_runs_issue = await _optional_overview_rows(
        "report_runs",
        lambda: queries.list_report_runs(limit=limit),
    )
    connector_sync_runs, connector_sync_runs_issue = await _optional_overview_rows(
        "connector_sync_runs",
        lambda: queries.list_connector_sync_runs(limit=limit),
    )
    audit_events, audit_events_issue = await _optional_overview_rows(
        "audit_events",
        lambda: queries.list_audit_events(limit=limit),
    )
    access_issues = [
        issue
        for issue in (
            scrape_jobs_issue,
            report_runs_issue,
            connector_sync_runs_issue,
            audit_events_issue,
        )
        if issue
    ]

    return {
        "tenants": await queries.list_tenants(),
        "scrape_jobs": scrape_jobs,
        "report_runs": report_runs,
        "connector_sync_runs": connector_sync_runs,
        "audit_events": audit_events,
        "access_issues": access_issues,
    }


@router.get("/tenants")
async def tenants(admin_tenant: dict = Depends(require_platform_admin)) -> list[dict]:
    del admin_tenant
    return await queries.list_tenants()


@router.get("/audit-events")
async def audit_events(
    tenant_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    admin_tenant: dict = Depends(require_platform_admin),
) -> list[dict]:
    del admin_tenant
    return await queries.list_audit_events(tenant_id, limit)


@router.post("/tenants/{tenant_id}/plan")
async def override_plan(
    tenant_id: str,
    body: AdminPlanOverride,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    tenant = await queries.update_tenant(tenant_id, {"plan": body.plan})
    if not tenant:
        raise HTTPException(status_code=404, detail="Mandant nicht gefunden")
    await record_audit_event(
        {**admin_tenant, "id": tenant_id},
        action="support.plan_override",
        resource_type="tenant",
        resource_id=tenant_id,
        metadata={"plan": body.plan, "reason": body.reason},
    )
    return tenant


@router.post("/scrape-jobs/{tenant_id}/{competitor_product_id}/retry")
async def retry_scrape(
    tenant_id: str,
    competitor_product_id: str,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    job = await queries.create_scrape_job(tenant_id, competitor_product_id, "queued")
    await record_audit_event(
        {**admin_tenant, "id": tenant_id},
        action="support.scrape_retry_queued",
        resource_type="scrape_job",
        resource_id=job.get("id"),
        metadata={"competitor_product_id": competitor_product_id},
    )
    return job


@router.post("/connectors/{tenant_id}/{connector_id}/disable")
async def disable_connector(
    tenant_id: str,
    connector_id: str,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    source = await queries.update_connector_source(tenant_id, connector_id, {"active": False})
    if not source:
        raise HTTPException(status_code=404, detail="Connector nicht gefunden")
    await record_audit_event(
        {**admin_tenant, "id": tenant_id},
        action="support.connector_disabled",
        resource_type="connector_source",
        resource_id=connector_id,
    )
    return {key: value for key, value in source.items() if key != "config"}


@router.post("/billing/adjustments", status_code=status.HTTP_201_CREATED)
async def create_billing_adjustment(
    body: BillingAdjustmentCreate,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    adjustment = await queries.create_billing_adjustment(body.model_dump(mode="json"))
    if body.type in {"refund", "credit_note"}:
        invoice = await queries.get_billing_invoice(body.tenant_reference, body.invoice_id)
        if invoice:
            await queries.update_billing_invoice_state(
                body.tenant_reference,
                body.invoice_id,
                "refunded" if body.type == "refund" else "credited",
            )
    await record_audit_event(
        {**admin_tenant, "id": body.tenant_reference},
        action=f"billing.{body.type}.recorded",
        resource_type="billing_adjustment",
        resource_id=adjustment.get("id"),
        metadata={"invoice_id": body.invoice_id, "amount_cents": body.amount_cents},
    )
    return adjustment


@router.get("/billing/refund-requests")
async def admin_refund_requests(admin_tenant: dict = Depends(require_platform_admin)) -> list[dict]:
    del admin_tenant
    return await queries.list_billing_refund_requests()


@router.post("/billing/refund-requests/{request_id}/approve")
async def approve_refund_request(
    request_id: str, body: BillingRefundDecision,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    request = await queries.get_billing_refund_request(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Erstattungsanfrage nicht gefunden")
    if request["status"] == "approved":
        return request
    if request["status"] != "requested":
        raise HTTPException(status_code=409, detail="Erstattungsanfrage wurde bereits bearbeitet")
    remaining = await queries.refundable_amount_cents(request["tenant_id"], request["invoice_id"])
    if int(request["amount_cents"]) > remaining + int(request["amount_cents"]):
        raise HTTPException(status_code=409, detail="Erstattungsbetrag überschreitet den Restbetrag")
    return await queries.update_billing_refund_request(request_id, {
        "status": "approved", "decision_reason": body.reason,
        "decided_by": admin_tenant.get("_actor_user_id"),
        "decided_at": datetime.now(timezone.utc).isoformat(),
    }) or request


@router.post("/billing/refund-requests/{request_id}/reject")
async def reject_refund_request(
    request_id: str, body: BillingRefundDecision,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    request = await queries.get_billing_refund_request(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Erstattungsanfrage nicht gefunden")
    if request["status"] == "rejected":
        return request
    if request["status"] != "requested":
        raise HTTPException(status_code=409, detail="Erstattungsanfrage wurde bereits bearbeitet")
    return await queries.update_billing_refund_request(request_id, {
        "status": "rejected", "decision_reason": body.reason or "Von Finance abgelehnt",
        "decided_by": admin_tenant.get("_actor_user_id"),
        "decided_at": datetime.now(timezone.utc).isoformat(),
    }) or request


@router.post("/billing/refund-requests/{request_id}/process")
async def process_refund_request(
    request_id: str, admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    request = await queries.get_billing_refund_request(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Erstattungsanfrage nicht gefunden")
    if request["status"] == "processing":
        return request
    if request["status"] != "approved":
        raise HTTPException(status_code=409, detail="Erstattung ist nicht freigegeben")
    invoice = request.get("billing_invoices") or {}
    tenant = await queries.get_tenant_by_id(request["tenant_id"])
    if not tenant or not tenant.get("viva_source_code") or not invoice.get("transaction_id"):
        raise HTTPException(status_code=409, detail="Viva-Referenzen für die Erstattung fehlen")
    await queries.update_billing_refund_request(request_id, {"status": "processing"})
    try:
        provider = await viva.refund_transaction(
            transaction_id=str(invoice["transaction_id"]),
            amount_cents=int(request["amount_cents"]),
            source_code=str(tenant["viva_source_code"]),
            merchant_reference=f"pricevault-refund:{request_id}",
            idempotency_key=str(request["idempotency_key"]),
        )
    except (viva.VivaAPIError, viva.VivaConfigurationError) as exc:
        await queries.update_billing_refund_request(request_id, {
            "status": "failed", "provider_response": {"error": str(exc)[:500]},
            "processed_at": datetime.now(timezone.utc).isoformat(),
        })
        raise HTTPException(status_code=502, detail="Viva-Erstattung ist fehlgeschlagen") from exc
    provider_transaction_id = provider.get("TransactionId", provider.get("transactionId"))
    updated = await queries.update_billing_refund_request(request_id, {
        "provider_transaction_id": provider_transaction_id,
        "provider_response": provider,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    })
    await record_audit_event(
        {**admin_tenant, "id": request["tenant_id"]}, action="billing.refund.processing",
        resource_type="billing_refund_request", resource_id=request_id,
        metadata={"provider_transaction_id": provider_transaction_id},
    )
    return updated or request


@router.get("/operations")
async def operations(admin_tenant: dict = Depends(require_platform_admin)) -> dict:
    del admin_tenant
    since = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    usage, product_events, reconciliations, tenants, costs, rates = await asyncio.gather(
        queries.list_usage_events_since(since), queries.list_product_events_since(since),
        queries.list_billing_reconciliations(), queries.list_tenants(),
        queries.list_tenant_cost_summaries(since[:10]), queries.list_internal_cost_rates(),
    )
    usage_totals: dict[str, float] = {}
    for event in usage:
        metric = str(event["metric"])
        usage_totals[metric] = usage_totals.get(metric, 0) + float(event["quantity"])
    funnel: dict[str, int] = {}
    for event in product_events:
        name = str(event["event_name"])
        funnel[name] = funnel.get(name, 0) + 1
    plans: dict[str, dict[str, float | int]] = {}
    retention: dict[str, dict[str, int]] = {}
    events_by_tenant: dict[str, list[dict[str, Any]]] = {}
    for event in product_events:
        events_by_tenant.setdefault(str(event["tenant_id"]), []).append(event)
    cost_by_tenant: dict[str, float] = {}
    for row in costs:
        cost_by_tenant[row["tenant_id"]] = cost_by_tenant.get(row["tenant_id"], 0) + float(row["estimated_cost_eur"])
    mrr_prices = {"free": 0, "pro": 29, "agency": 99}
    for tenant in tenants:
        plan = str(tenant.get("plan") or "free")
        entry = plans.setdefault(plan, {"tenants": 0, "mrr_eur": 0, "estimated_cost_eur": 0, "estimated_gross_margin_eur": 0})
        entry["tenants"] += 1
        entry["mrr_eur"] += mrr_prices.get(plan, 0)
        entry["estimated_cost_eur"] += cost_by_tenant.get(tenant["id"], 0)
        entry["estimated_gross_margin_eur"] = float(entry["mrr_eur"]) - float(entry["estimated_cost_eur"])
        cohort = retention.setdefault(plan, {"signups": 0, "activated_24h": 0, "retained_7d": 0, "retained_30d": 0})
        created = datetime.fromisoformat(str(tenant["created_at"]).replace("Z", "+00:00"))
        tenant_events = events_by_tenant.get(str(tenant["id"]), [])
        cohort["signups"] += 1
        if any(event["event_name"] == "first_validated_scrape" and datetime.fromisoformat(str(event["occurred_at"]).replace("Z", "+00:00")) <= created + timedelta(hours=24) for event in tenant_events):
            cohort["activated_24h"] += 1
        if any(created + timedelta(days=7) <= datetime.fromisoformat(str(event["occurred_at"]).replace("Z", "+00:00")) < created + timedelta(days=14) for event in tenant_events):
            cohort["retained_7d"] += 1
        if any(created + timedelta(days=30) <= datetime.fromisoformat(str(event["occurred_at"]).replace("Z", "+00:00")) < created + timedelta(days=37) for event in tenant_events):
            cohort["retained_30d"] += 1
    return {
        "period_days": 30,
        "usage": usage_totals,
        "funnel": funnel,
        "reconciliations": reconciliations,
        "capacity_thresholds": {"warning": 0.7, "critical": 0.9},
        "hard_plan_enforcement": False,
        "plans": plans,
        "cost_rates_configured": bool(rates) and all(float(rate["cost_eur_per_unit"]) > 0 for rate in rates),
        "retention_by_plan": retention,
    }


@router.post("/sources/{tenant_id}/{competitor_product_id}/policy")
async def override_source_policy(
    tenant_id: str,
    competitor_product_id: str,
    body: SourcePolicyOverride,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    policy = await queries.get_source_policy(tenant_id, competitor_product_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Abrufrichtlinie nicht gefunden")
    if body.override == "allow" and not policy.get("customer_authorized_at"):
        raise HTTPException(status_code=409, detail="Freigabe erfordert zuerst die Bestätigung des Kunden")
    updated = await queries.upsert_source_policy(
        tenant_id,
        competitor_product_id,
        {**policy, "operator_override": body.override, "block_reason": body.reason},
    )
    await queries.update_product_mapping(
        tenant_id,
        competitor_product_id,
        {
            "health_status": "blocked" if body.override == "block" else "degraded",
            "last_failure_reason": body.reason,
        },
    )
    await record_audit_event(
        {**admin_tenant, "id": tenant_id},
        action=f"source_policy.operator_{body.override}",
        resource_type="competitor_product",
        resource_id=competitor_product_id,
        metadata={"reason": body.reason},
    )
    return updated


@router.post("/repricing/{tenant_id}/changes/{change_id}/rollback")
async def operator_rollback_change(
    tenant_id: str, change_id: str, admin_tenant: dict = Depends(require_platform_admin)
) -> dict:
    from agents.repricing_agent import RepricingAgent

    change = await queries.get_repricing_change(tenant_id, change_id)
    if not change:
        raise HTTPException(status_code=404, detail="Preisänderung nicht gefunden")
    if change.get("actor_type") != "automatic":
        raise HTTPException(status_code=403, detail="Manuelle Änderungen setzt der Mandanten-Admin zurück")
    try:
        return await RepricingAgent().rollback(tenant_id, change, actor_id=admin_tenant.get("_actor_user_id"))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/public-incidents")
async def admin_public_incidents(admin_tenant: dict = Depends(require_platform_admin)) -> list[dict]:
    del admin_tenant
    return await queries.list_public_incidents()


@router.post("/public-incidents", status_code=201)
async def create_public_incident(
    body: PublicIncidentWrite, admin_tenant: dict = Depends(require_platform_admin)
) -> dict:
    del admin_tenant
    return await queries.create_public_incident(body.model_dump(mode="json"))


@router.patch("/public-incidents/{incident_id}")
async def update_public_incident(
    incident_id: str, body: PublicIncidentWrite,
    admin_tenant: dict = Depends(require_platform_admin),
) -> dict:
    del admin_tenant
    incident = await queries.update_public_incident(incident_id, body.model_dump(mode="json"))
    if not incident:
        raise HTTPException(status_code=404, detail="Öffentlicher Vorfall nicht gefunden")
    return incident


@router.delete("/public-incidents/{incident_id}", status_code=204)
async def delete_public_incident(
    incident_id: str, admin_tenant: dict = Depends(require_platform_admin)
) -> None:
    del admin_tenant
    if not await queries.delete_public_incident(incident_id):
        raise HTTPException(status_code=404, detail="Öffentlicher Vorfall nicht gefunden")


@router.put("/cost-rates/{metric}")
async def update_cost_rate(
    metric: str, body: CostRateWrite, admin_tenant: dict = Depends(require_platform_admin)
) -> dict:
    del admin_tenant
    allowed = {"browser_seconds", "llm_calls", "llm_input_tokens", "llm_output_tokens", "queue_jobs", "emails", "report_generations", "stored_snapshots"}
    if metric not in allowed:
        raise HTTPException(status_code=400, detail="Unbekannte Kostenmetrik")
    return await queries.upsert_internal_cost_rate(metric, body.cost_eur_per_unit)


@router.get("/recovery-drills")
async def recovery_drills(admin_tenant: dict = Depends(require_platform_admin)) -> list[dict]:
    del admin_tenant
    return await queries.list_recovery_drills()


@router.post("/recovery-drills", status_code=201)
async def create_recovery_drill(
    body: RecoveryDrillWrite, admin_tenant: dict = Depends(require_platform_admin)
) -> dict:
    del admin_tenant
    if body.environment.casefold() == "production":
        raise HTTPException(status_code=400, detail="Wiederherstellungstests dürfen nicht in Produktion laufen")
    return await queries.create_recovery_drill(body.model_dump(mode="json"))


@router.get("/backup-verifications")
async def backup_verifications(admin_tenant: dict = Depends(require_platform_admin)) -> list[dict]:
    del admin_tenant
    return await queries.list_backup_verifications()


@router.post("/backup-verifications", status_code=201)
async def create_backup_verification(
    body: BackupVerificationWrite, admin_tenant: dict = Depends(require_platform_admin)
) -> dict:
    del admin_tenant
    return await queries.create_backup_verification(body.model_dump(mode="json"))


@router.get("/release-readiness")
async def release_readiness(admin_tenant: dict = Depends(require_platform_admin)) -> dict:
    del admin_tenant
    backups, drills = await asyncio.gather(queries.list_backup_verifications(), queries.list_recovery_drills())
    now = datetime.now(timezone.utc)
    current_backup = next((row for row in backups if row["status"] == "current" and datetime.fromisoformat(str(row["backup_observed_at"]).replace("Z", "+00:00")) >= now - timedelta(hours=24)), None)
    current_drill = next((row for row in drills if row["status"] == "passed" and row.get("completed_at") and datetime.fromisoformat(str(row["completed_at"]).replace("Z", "+00:00")) >= now - timedelta(days=92)), None)
    return {"ready": bool(current_backup and current_drill), "current_backup": current_backup, "quarterly_restore_drill": current_drill, "redis_authoritative": False}


@router.get("/security-incidents")
async def security_incidents(admin_tenant: dict = Depends(require_platform_admin)) -> list[dict]:
    del admin_tenant
    return await queries.list_operator_records("security_incidents")


@router.post("/security-incidents", status_code=201)
async def create_security_incident(body: SecurityIncidentWrite, admin_tenant: dict = Depends(require_platform_admin)) -> dict:
    del admin_tenant
    return await queries.create_operator_record("security_incidents", body.model_dump(mode="json"))


@router.patch("/security-incidents/{record_id}")
async def update_security_incident(record_id: str, body: SecurityIncidentWrite, admin_tenant: dict = Depends(require_platform_admin)) -> dict:
    del admin_tenant
    record = await queries.update_operator_record("security_incidents", record_id, body.model_dump(mode="json"))
    if not record:
        raise HTTPException(status_code=404, detail="Sicherheitsvorfall nicht gefunden")
    return record


@router.get("/reconciliation-exceptions")
async def reconciliation_exceptions(admin_tenant: dict = Depends(require_platform_admin)) -> list[dict]:
    del admin_tenant
    return await queries.list_operator_records("billing_reconciliation_exceptions")


@router.post("/reconciliation-exceptions", status_code=201)
async def create_reconciliation_exception(body: ReconciliationExceptionWrite, admin_tenant: dict = Depends(require_platform_admin)) -> dict:
    del admin_tenant
    return await queries.create_operator_record("billing_reconciliation_exceptions", body.model_dump(mode="json"))


@router.get("/source-repairs")
async def source_repairs(admin_tenant: dict = Depends(require_platform_admin)) -> list[dict]:
    del admin_tenant
    return await queries.list_operator_records("source_repair_assignments")


@router.post("/source-repairs", status_code=201)
async def create_source_repair(body: SourceRepairAssignmentWrite, admin_tenant: dict = Depends(require_platform_admin)) -> dict:
    del admin_tenant
    mapping = await queries.get_product_mapping(body.tenant_id, body.competitor_product_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Preisquelle nicht gefunden")
    return await queries.create_operator_record("source_repair_assignments", body.model_dump(mode="json"))
