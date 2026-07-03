"""Verified Viva payment webhook handling."""

from calendar import monthrange
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
    if _value(payload, "eventTypeId") != 1796:
        return {"ok": True}

    event = _value(payload, "eventData")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Ungültige Viva-Ereignisdaten")
    transaction_id = _value(event, "transactionId")
    order_code = _value(event, "orderCode")
    if not transaction_id or not order_code:
        raise HTTPException(status_code=400, detail="Viva-Transaktionsdaten fehlen")

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
    return {"ok": True}
