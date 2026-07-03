"""Viva Smart Checkout subscription and invoice endpoints."""

import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from auth.plan_guard import require_owner
from db import queries
from models.schemas import BillingCheckoutRequest
from payments import viva
from payments.invoices import render_invoice_pdf


router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/invoices")
async def list_invoices(tenant: dict = Depends(require_owner)) -> list[dict]:
    return await queries.list_billing_invoices(tenant["id"])


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


@router.post("/checkout")
async def create_checkout(
    body: BillingCheckoutRequest, tenant: dict = Depends(require_owner)
) -> dict[str, str]:
    try:
        order_code = await viva.create_payment_order(
            tenant_id=tenant["id"], email=tenant.get("_email"), plan=body.plan
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
            "amount_cents": viva.PLAN_AMOUNTS[body.plan],
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
    return {"canceled": True}
