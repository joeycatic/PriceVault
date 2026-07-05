"""Verified Viva payment webhook handling."""

from calendar import monthrange
from contextlib import suppress
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, Request

from db import queries
from db.client import supabase_context
from payments import viva
from payments.invoices import create_paid_invoice


def _value(payload: dict[str, Any], name: str) -> Any:
    return payload.get(name, payload.get(name[:1].upper() + name[1:]))


def next_month(value: datetime) -> datetime:
    year = value.year + (1 if value.month == 12 else 0)
    month = 1 if value.month == 12 else value.month + 1
    return value.replace(year=year, month=month, day=min(value.day, monthrange(year, month)[1]))


async def viva_webhook_key() -> dict[str, Any]:
    try:
        return await viva.webhook_verification_key()
    except viva.VivaConfigurationError as exc:
        raise HTTPException(status_code=503, detail="Viva ist nicht vollständig konfiguriert") from exc
    except viva.VivaAPIError as exc:
        raise HTTPException(status_code=502, detail="Viva-Verifizierung ist nicht erreichbar") from exc


async def handle_viva_webhook(request: Request) -> dict[str, bool]:
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Ungültiger Payload") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Ungültiger Payload")
    event_type = _value(payload, "eventTypeId")
    if event_type not in (1796, 1797):
        return {"ok": True}

    event = _value(payload, "eventData")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Ungültige Viva-Ereignisdaten")
    transaction_id = _value(event, "transactionId")
    order_code = _value(event, "orderCode")
    if not transaction_id or not order_code:
        raise HTTPException(status_code=400, detail="Viva-Transaktionsdaten fehlen")

    if event_type == 1797:
        parent_id = str(_value(event, "parentId") or "")
        status_id = _value(event, "statusId")
        amount = float(_value(event, "amount") or 0)
        with supabase_context(admin=True):
            refund = await queries.get_billing_refund_request_by_provider_transaction(str(transaction_id))
            if not refund or refund.get("status") == "succeeded":
                return {"ok": True}
            invoice = refund.get("billing_invoices") or {}
            amount_cents = int(refund["amount_cents"])
            amount_matches = amount_cents in {round(abs(amount)), round(abs(amount) * 100)}
            if (
                refund.get("status") != "processing"
                or parent_id != str(invoice.get("transaction_id") or "")
                or int(order_code) != int((await queries.get_billing_order_for_invoice(refund["invoice_id"]) or {}).get("order_code") or 0)
                or status_id != "F"
                or not amount_matches
            ):
                raise HTTPException(status_code=400, detail="Viva-Erstattung konnte nicht bestätigt werden")
            evidence = {
                "parent_transaction_id": parent_id,
                "reversal_transaction_id": transaction_id,
                "order_code": order_code,
                "status_id": status_id,
                "event_type_id": event_type,
            }
            await queries.create_billing_adjustment({
                "tenant_reference": refund["tenant_reference"], "invoice_id": refund["invoice_id"],
                "type": "refund", "amount_cents": amount_cents,
                "reason": refund["reason"], "provider_transaction_id": str(transaction_id),
                "evidence": evidence,
            })
            await queries.create_billing_adjustment({
                "tenant_reference": refund["tenant_reference"], "invoice_id": refund["invoice_id"],
                "type": "credit_note", "amount_cents": amount_cents,
                "reason": f"Gutschrift zur Erstattung: {refund['reason']}",
                "provider_transaction_id": str(transaction_id), "evidence": evidence,
            })
            remaining = await queries.refundable_amount_cents(refund["tenant_reference"], refund["invoice_id"])
            await queries.update_billing_invoice_state(
                refund["tenant_reference"], refund["invoice_id"], "refunded" if remaining == 0 else "credited"
            )
            await queries.update_billing_refund_request(refund["id"], {
                "status": "succeeded", "provider_response": {**(refund.get("provider_response") or {}), "verified_webhook": evidence},
                "processed_at": datetime.now(timezone.utc).isoformat(),
            })
        return {"ok": True}

    with supabase_context(admin=True):
        order = await queries.get_billing_order(int(order_code))
    if not order:
        return {"ok": True}
    if order.get("status") == "paid":
        return {"ok": True}

    try:
        transaction = await viva.retrieve_transaction(str(transaction_id))
    except viva.VivaConfigurationError as exc:
        raise HTTPException(status_code=503, detail="Viva ist nicht vollständig konfiguriert") from exc
    except viva.VivaAPIError as exc:
        raise HTTPException(status_code=502, detail="Viva-Transaktion konnte nicht geprüft werden") from exc

    verified_order = int(_value(transaction, "orderCode") or 0)
    verified_status = _value(transaction, "statusId")
    verified_amount = _value(transaction, "amount")
    amount_cents = round(float(verified_amount or 0) * 100)
    if (
        verified_order != int(order["order_code"])
        or verified_status != "F"
        or amount_cents != int(order["amount_cents"])
    ):
        raise HTTPException(status_code=400, detail="Viva-Zahlung konnte nicht bestätigt werden")

    now = datetime.now(timezone.utc)
    source_code = str(_value(transaction, "sourceCode") or _value(event, "sourceCode") or "")
    with supabase_context(admin=True):
        tenant = await queries.get_tenant_by_id(order["tenant_id"])
        if not tenant:
            raise HTTPException(status_code=404, detail="Mandant nicht gefunden")
        await create_paid_invoice(
            tenant=tenant,
            plan=order["plan"],
            transaction_id=str(transaction_id),
            paid_at=now.isoformat(),
            billing_order_id=order.get("id"),
        )
        await queries.update_billing_order(
            int(order_code),
            {"status": "paid", "transaction_id": transaction_id, "paid_at": now.isoformat()},
        )
        await queries.update_tenant(
            order["tenant_id"],
            {
                "plan": order["plan"],
                "billing_provider": "viva",
                "viva_initial_transaction_id": transaction_id,
                "viva_source_code": source_code,
                "subscription_status": "active",
                "subscription_plan": order["plan"],
                "subscription_current_period_end": next_month(now).isoformat(),
                "subscription_cancel_at_period_end": False,
                "cancellation_effective_at": None,
                "failed_payment_count": 0,
                "last_payment_error": None,
                "next_payment_retry_at": None,
            },
        )
        with suppress(Exception):
            await queries.record_product_event(order["tenant_id"], "paid_conversion", order["plan"])
    return {"ok": True}
