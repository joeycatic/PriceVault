"""Operator-facing reliability summaries."""

import asyncio
import os
from collections import Counter
from datetime import datetime, timedelta, timezone

import resend

from db import queries
from db.client import supabase_context
from emails.settings import resend_sender
from utils.logger import get_logger


logger = get_logger("jobs.operator")


def _pct(part: int, total: int) -> str:
    if total <= 0:
        return "0,0 %"
    return f"{part / total * 100:.1f} %".replace(".", ",")


async def send_daily_operator_summary(ctx: dict) -> dict[str, int | str]:
    del ctx
    since = datetime.now(timezone.utc) - timedelta(days=1)
    with supabase_context(admin=True):
        jobs = await queries.list_scrape_jobs_since(since.isoformat())

    total = len(jobs)
    by_state = Counter(str(job.get("state") or "unknown") for job in jobs)
    failed = by_state["failed"]
    retrying = by_state["retrying"]
    succeeded = by_state["succeeded"]
    broken_reasons = Counter(
        str(job.get("failure_reason") or "Unbekannter Fehler")[:160]
        for job in jobs
        if job.get("state") in {"failed", "retrying"} and job.get("failure_reason")
    )
    lines = [
        "PriceVault Operator-Tagesübersicht",
        since.date().isoformat(),
        "",
        f"Scrape-Jobs: {total}",
        f"Erfolgreich: {succeeded} ({_pct(succeeded, total)})",
        f"Fehlgeschlagen: {failed} ({_pct(failed, total)})",
        f"Retrying: {retrying} ({_pct(retrying, total)})",
        "",
        "Häufigste Fehler:",
    ]
    if broken_reasons:
        lines.extend(f"- {count}x {reason}" for reason, count in broken_reasons.most_common(8))
    else:
        lines.append("- Keine Fehler im Auswertungsfenster")
    text = "\n".join(lines)

    recipient = os.getenv("OPS_ALERT_EMAIL")
    api_key = os.getenv("RESEND_API_KEY")
    if not recipient or not api_key:
        logger.warning(
            "operator_summary_email_skipped",
            action="operator_summary_email_skipped",
            reason="missing_recipient_or_resend",
            total=total,
            failed=failed,
        )
        return {"status": "skipped", "total": total, "failed": failed}

    resend.api_key = api_key
    await asyncio.to_thread(
        resend.Emails.send,
        {
            "from": resend_sender(),
            "to": [recipient],
            "subject": "PriceVault Scrape-Tagesübersicht",
            "text": text,
        },
    )
    logger.info("operator_summary_sent", action="operator_summary_sent", total=total, failed=failed)
    return {"status": "sent", "total": total, "failed": failed}
