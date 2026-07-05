"""Scheduled GDPR deletion execution after the cancellable cooling-off period."""

import hashlib
import json
import asyncio
import base64
import os
from datetime import datetime, timedelta, timezone

import resend

from db import queries
from db.client import supabase_context
from emails.settings import resend_sender
from payments.deletion_receipts import render_deletion_receipt_pdf


async def _deliver_receipt(receipt: dict) -> bool:
    email = receipt.get("recipient_email")
    if not email:
        return False
    try:
        api_key = os.environ["RESEND_API_KEY"]
        resend.api_key = api_key
        pdf = render_deletion_receipt_pdf(receipt)
        result = await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": resend_sender(), "to": [email],
                "subject": "PriceVault Löschbestätigung",
                "text": "Im Anhang findest du die Bestätigung zur ausgeführten Kontolöschung.",
                "attachments": [{"filename": "pricevault-loeschbestaetigung.pdf", "content": base64.b64encode(pdf).decode("ascii")}],
                "headers": {"Idempotency-Key": f"deletion-receipt-{receipt['id']}"},
            },
        )
        await queries.update_privacy_deletion_receipt(receipt["id"], {
            "delivery_status": "sent", "delivery_attempts": int(receipt.get("delivery_attempts") or 0) + 1,
            "delivered_at": datetime.now(timezone.utc).isoformat(), "last_delivery_error": None,
            "audit_receipt": {**(receipt.get("audit_receipt") or {}), "resend_id": (result or {}).get("id")},
        })
        return True
    except Exception as exc:
        await queries.update_privacy_deletion_receipt(receipt["id"], {
            "delivery_status": "failed", "delivery_attempts": int(receipt.get("delivery_attempts") or 0) + 1,
            "last_delivery_error": str(exc)[:1000],
        })
        return False


async def execute_due_privacy_deletions(ctx: dict) -> dict[str, int]:
    del ctx
    completed = 0
    failed = 0
    now = datetime.now(timezone.utc)
    with supabase_context(admin=True):
        await queries.erase_expired_receipt_emails(now.isoformat())
        for receipt in await queries.list_pending_privacy_receipts(now.isoformat()):
            await _deliver_receipt(receipt)
        requests = await queries.list_due_privacy_deletions(now.isoformat())
        for request in requests:
            tenant_id = request["tenant_id"]
            try:
                await queries.update_privacy_request(
                    tenant_id,
                    request["id"],
                    {"status": "processing"},
                )
                audit_events = await queries.list_audit_events(tenant_id, limit=10_000)
                receipt_payload = {
                    "tenant_reference": tenant_id,
                    "request_reference": request["id"],
                    "executed_at": now.isoformat(),
                    "audit_event_count": len(audit_events),
                    "audit_digest": hashlib.sha256(
                        json.dumps(audit_events, sort_keys=True, default=str).encode()
                    ).hexdigest(),
                    "retained_records": ["billing_invoices", "billing_adjustments"],
                }
                await queries.update_privacy_request(
                    tenant_id, request["id"],
                    {"status": "processor_cleanup", "processor_status": {"supabase_operational_data": "deleting", "resend": "receipt_pending", "sentry": "retention_policy_pending"}},
                )
                receipt = await queries.create_privacy_deletion_receipt(
                    {
                        "tenant_reference": tenant_id,
                        "request_reference": request["id"],
                        "audit_receipt": receipt_payload,
                        "processor_status": {
                            "supabase_operational_data": "deleted",
                            "redis_jobs": "expire_or_reconstruct",
                            "resend": "request_required_if_applicable",
                            "sentry": "retention_policy_pending",
                        },
                        "backup_expiry_status": "pending_expiry",
                        "recipient_email": request.get("receipt_email"),
                        "delivery_status": "pending",
                        "erase_recipient_at": (now + timedelta(days=30)).isoformat(),
                        "completed_at": now.isoformat(),
                    }
                )
                if not await queries.delete_tenant(tenant_id):
                    raise RuntimeError("Mandant konnte nicht gelöscht werden")
                await _deliver_receipt(receipt)
                completed += 1
            except Exception as exc:
                failed += 1
                try:
                    await queries.update_privacy_request(
                        tenant_id, request["id"], {"status": "failed", "notes": str(exc)[:1000]},
                    )
                except Exception:
                    pass
    return {"completed": completed, "failed": failed}
