"""Viva Smart Checkout subscription and invoice endpoints."""

import io
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from auth.plan_guard import require_owner
from db import queries
from models.schemas import BillingCheckoutRequest, BillingRefundRequestCreate
from payments import viva
from payments.invoices import render_adjustment_pdf, render_invoice_pdf
from payments.vat import VATValidationError, VIESUnavailable, determine_vat


router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/vat-validation")
async def vat_validation_status(tenant: dict = Depends(require_owner)) -> dict:
    return {
        "billing_country": tenant.get("billing_country"),
        "normalized_vat_id": tenant.get("normalized_vat_id"),
        "status": tenant.get("vat_validation_status", "unverified"),
        "validated_at": tenant.get("vat_validated_at"),
        "reference": tenant.get("vat_validation_reference"),
        "tax_treatment": tenant.get("tax_treatment"),
    }


@router.get("/invoices")
async def list_invoices(tenant: dict = Depends(require_owner)) -> list[dict]:
    return await queries.list_billing_invoices(tenant["id"])


@router.get("/adjustments")
async def list_adjustments(tenant: dict = Depends(require_owner)) -> list[dict]:
    return await queries.list_billing_adjustments(tenant["id"])


@router.get("/refund-requests")
async def list_refund_requests(tenant: dict = Depends(require_owner)) -> list[dict]:
    return await queries.list_billing_refund_requests(tenant["id"])


@router.post("/refund-requests", status_code=201)
async def create_refund_request(
    body: BillingRefundRequestCreate, tenant: dict = Depends(require_owner)
) -> dict:
    remaining = await queries.refundable_amount_cents(tenant["id"], body.invoice_id)
    if remaining < 0:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    if body.amount_cents > remaining:
        raise HTTPException(status_code=409, detail=f"Maximal erstattungsfähig sind {remaining / 100:.2f} EUR")
    return await queries.create_billing_refund_request(
        {
            "tenant_id": tenant["id"],
            "tenant_reference": tenant["id"],
            "invoice_id": body.invoice_id,
            "requested_by": tenant["_actor_user_id"],
            "amount_cents": body.amount_cents,
            "reason": body.reason,
            "idempotency_key": f"refund-{uuid4()}",
        }
    )


@router.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(
    invoice_id: str, tenant: dict = Depends(require_owner)
) -> StreamingResponse:
    invoice = await queries.get_billing_invoice(tenant["id"], invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    return StreamingResponse(
        io.BytesIO(render_invoice_pdf(invoice)),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{invoice["invoice_number"]}.pdf"'
        },
    )


@router.get("/adjustments/{adjustment_id}/pdf")
async def adjustment_pdf(
    adjustment_id: str, tenant: dict = Depends(require_owner)
) -> StreamingResponse:
    adjustment = await queries.get_billing_adjustment(tenant["id"], adjustment_id)
    if not adjustment:
        raise HTTPException(status_code=404, detail="Abrechnungsbeleg nicht gefunden")
    content = render_adjustment_pdf(adjustment)
    return StreamingResponse(
        io.BytesIO(content), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{adjustment["adjustment_number"]}.pdf"'},
    )


@router.post("/checkout")
async def create_checkout(
    body: BillingCheckoutRequest, tenant: dict = Depends(require_owner)
) -> dict[str, str]:
    try:
        tax = await determine_vat(tenant, body.billing_country, body.vat_id)
    except VIESUnavailable as exc:
        await queries.update_tenant(tenant["id"], {"vat_validation_status": "unavailable"})
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except VATValidationError as exc:
        await queries.update_tenant(tenant["id"], {"vat_validation_status": "invalid"})
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    net_amount = viva.PLAN_NET_AMOUNTS[body.plan]
    gross_amount = viva.PLAN_AMOUNTS[body.plan] if tax.vat_rate == 19 else net_amount
    vat_amount = gross_amount - net_amount
    tax_evidence = {
        "country": tax.country,
        "normalized_vat_id": tax.normalized_vat_id,
        "validated_at": tax.validated_at.isoformat(),
        "validation_reference": tax.reference,
        "tax_treatment": tax.tax_treatment,
    }
    await queries.update_tenant(
        tenant["id"],
        {
            "billing_country": tax.country,
            "normalized_vat_id": tax.normalized_vat_id,
            "vat_validation_status": "valid",
            "vat_validated_at": tax.validated_at.isoformat(),
            "vat_validation_reference": tax.reference,
            "tax_treatment": tax.tax_treatment,
        },
    )
    try:
        order_code = await viva.create_payment_order(
            tenant_id=tenant["id"], email=tenant.get("_email"), plan=body.plan,
            amount_cents=gross_amount,
        )
    except viva.VivaConfigurationError as exc:
        raise HTTPException(status_code=503, detail="Viva ist nicht vollständig konfiguriert") from exc
    except viva.VivaAPIError as exc:
        raise HTTPException(status_code=502, detail="Viva Checkout ist derzeit nicht erreichbar") from exc
    await queries.create_billing_order(
        {
            "tenant_id": tenant["id"],
            "order_code": order_code,
            "plan": body.plan,
            "amount_cents": gross_amount,
            "net_amount_cents": net_amount,
            "vat_rate": tax.vat_rate,
            "vat_amount_cents": vat_amount,
            "billing_country": tax.country,
            "normalized_vat_id": tax.normalized_vat_id,
            "vat_validation_reference": tax.reference,
            "tax_treatment": tax.tax_treatment,
            "tax_evidence": tax_evidence,
        }
    )
    return {"url": viva.checkout_url(order_code)}


@router.post("/cancel")
async def cancel_subscription(tenant: dict = Depends(require_owner)) -> dict[str, bool]:
    if tenant.get("billing_provider") != "viva" or tenant.get("subscription_status") != "active":
        raise HTTPException(status_code=400, detail="Kein aktives Viva-Abonnement vorhanden")
    await queries.update_tenant(
        tenant["id"],
        {
            "subscription_cancel_at_period_end": True,
            "cancellation_effective_at": tenant.get("subscription_current_period_end"),
            "billing_status_metadata": {"cancel_requested": True},
        },
    )
    await queries.record_product_event(tenant["id"], "cancellation", tenant.get("plan"))
    return {"canceled": True}
