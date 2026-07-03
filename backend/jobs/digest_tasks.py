"""Idempotent, tenant-local daily alert digest delivery."""

import asyncio
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import resend

from db import queries
from db.client import supabase_context
from emails.settings import app_url, resend_sender
from utils.logger import get_logger


logger = get_logger("jobs.digest")


def _zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "Europe/Berlin")
    except ZoneInfoNotFoundError:
        return ZoneInfo("Europe/Berlin")


def _money(value: object) -> str:
    if value is None:
        return "–"
    return f"{float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " €"


def _digest_text(shop_name: str, digest_date: str, events: list[dict]) -> str:
    lines = [f"PriceVault Tagesübersicht für {shop_name}", digest_date, ""]
    if not events:
        lines.append("Seit der letzten Tagesübersicht gab es keine neuen Preis- oder Bestandsalarme.")
    else:
        lines.append(f"Neue Ereignisse: {len(events)}")
        lines.append("")
        for event in events:
            mapping = event.get("competitor_products") or {}
            product = mapping.get("products") or {}
            competitor = mapping.get("competitors") or {}
            reason = event.get("trigger_reason") or "Preisalarm"
            lines.append(
                f"- {product.get('name', 'Produkt')} · {competitor.get('shop_name', 'Mitbewerber')}: "
                f"{reason}, {_money(event.get('competitor_price'))}"
            )
    lines.extend(["", f"Alle Details: {app_url('/dashboard/alerts')}"])
    return "\n".join(lines)


async def enqueue_due_alert_digests(ctx: dict) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    queued = 0
    with supabase_context(admin=True):
        for tenant in await queries.list_tenants():
            settings = tenant.get("notification_defaults") or {}
            if settings.get("daily_digest_enabled", True) is not True:
                continue
            recipient = settings.get("daily_digest_email") or tenant.get("invoice_email")
            if not recipient:
                continue
            local_now = now.astimezone(_zone(tenant.get("timezone")))
            digest_hour = min(23, max(0, int(settings.get("daily_digest_hour", 7))))
            if local_now.hour != digest_hour:
                continue
            digest_date = local_now.date().isoformat()
            run = await queries.create_alert_digest_run(tenant["id"], digest_date, recipient)
            if not run or run.get("status") in {"sending", "sent", "skipped"}:
                continue
            job = await ctx["redis"].enqueue_job(
                "send_alert_digest",
                tenant_id=tenant["id"],
                run_id=run["id"],
                _job_id=f"alert-digest-{tenant['id']}-{digest_date}",
            )
            if job:
                queued += 1
                logger.info(
                    "alert_digest_queued",
                    action="alert_digest_queued",
                    tenant_id=tenant["id"],
                    job_id=job.job_id,
                )
    return {"queued": queued}


async def send_alert_digest(ctx: dict, *, tenant_id: str, run_id: str) -> dict[str, str]:
    del ctx
    now = datetime.now(timezone.utc)
    with supabase_context(admin=True):
        run = await queries.get_alert_digest_run(tenant_id, run_id)
        tenant = await queries.get_tenant_by_id(tenant_id)
        if not run or not tenant:
            return {"status": "missing"}
        if run.get("status") == "sent":
            return {"status": "sent"}
        await queries.update_alert_digest_run(
            tenant_id, run_id, {"status": "sending", "started_at": now.isoformat()}
        )
        local_now = now.astimezone(_zone(tenant.get("timezone")))
        since = (local_now - timedelta(days=1)).astimezone(timezone.utc).isoformat()
        events = await queries.list_alert_events_since(tenant_id, since)

    text = _digest_text(tenant["shop_name"], run["digest_date"], events)
    try:
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key:
            raise RuntimeError("RESEND_API_KEY is not configured")
        resend.api_key = api_key
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": resend_sender(),
                "to": [run["recipient"]],
                "subject": f"PriceVault Tagesübersicht · {run['digest_date']}",
                "text": text,
            },
        )
    except Exception as exc:
        with supabase_context(admin=True):
            await queries.update_alert_digest_run(
                tenant_id,
                run_id,
                {"status": "failed", "event_count": len(events), "error": str(exc)[:1000]},
            )
        raise

    with supabase_context(admin=True):
        await queries.update_alert_digest_run(
            tenant_id,
            run_id,
            {
                "status": "sent",
                "event_count": len(events),
                "error": None,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    return {"status": "sent"}
