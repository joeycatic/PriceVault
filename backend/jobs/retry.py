"""Retry exhaustion and dead-letter queue helpers."""

import asyncio
import os

from arq import Retry
import resend

from db import queries
from db.client import supabase_context
from emails.settings import resend_sender
from utils.logger import get_logger


logger = get_logger("jobs.retry")
MAX_ATTEMPTS = int(os.environ.get("SCRAPE_MAX_ATTEMPTS", "3"))
ALERT_EMAIL = os.environ.get("OPS_ALERT_EMAIL", "ops@pricevault.de")
RETRY_BASE_SECONDS = int(os.environ.get("SCRAPE_RETRY_BASE_SECONDS", "5"))
RETRY_MAX_SECONDS = int(os.environ.get("SCRAPE_RETRY_MAX_SECONDS", "300"))
TRANSIENT_ERROR_MARKERS = (
    "timeout",
    "timed out",
    "net::",
    "econn",
    "connection",
    "temporarily",
    "too many requests",
    "rate limit",
    "browserless",
    "target closed",
    "navigation",
)
PERMANENT_ERROR_MARKERS = (
    "strict mode violation",
    "selector",
    "no price found",
    "could not parse",
    "invalid url",
    "permissionerror",
    "nicht freigegeben",
    "währung",
    "currency",
)


def retry_delay(attempt: int) -> int:
    """Return the capped exponential delay before the next attempt."""
    return min(RETRY_MAX_SECONDS, RETRY_BASE_SECONDS * (2 ** max(0, attempt - 1)))


def is_transient_scrape_error(error: str) -> bool:
    normalized = error.casefold()
    if any(marker in normalized for marker in PERMANENT_ERROR_MARKERS):
        return False
    return any(marker in normalized for marker in TRANSIENT_ERROR_MARKERS)


async def send_to_dlq(
    ctx: dict,
    *,
    product_id: str | None = None,
    competitor_product_id: str | None = None,
    tenant_id: str,
    error: str,
    attempts: int,
) -> dict[str, bool]:
    del ctx
    with supabase_context(admin=True):
        await queries.insert_scrape_failure(
            {
                "tenant_id": tenant_id,
                "product_id": product_id,
                "competitor_product_id": competitor_product_id,
                "error": error[:2000],
                "attempts": attempts,
            }
        )

    api_key = os.environ.get("RESEND_API_KEY")
    if api_key:
        resend.api_key = api_key
        try:
            await asyncio.to_thread(
                resend.Emails.send,
                {
                    "from": resend_sender(),
                    "to": [ALERT_EMAIL],
                    "subject": f"[DLQ] Scrape failed after {attempts} attempts",
                    "html": (
                        f"<p>tenant_id: {tenant_id}<br>"
                        f"product_id: {product_id or '-'}<br>"
                        f"competitor_product_id: {competitor_product_id or '-'}<br>"
                        f"error: {error}</p>"
                    ),
                },
            )
        except Exception as exc:
            logger.error(
                "dlq_email_failed",
                action="dlq_email_failed",
                tenant_id=tenant_id,
                error=str(exc),
            )
    else:
        logger.warning(
            "dlq_email_skipped",
            action="dlq_email_skipped",
            tenant_id=tenant_id,
        )
    return {"queued": True}


async def maybe_retry_or_dlq(
    ctx: dict,
    *,
    tenant_id: str,
    error: str,
    product_id: str | None = None,
    competitor_product_id: str | None = None,
) -> None:
    attempt = int(ctx.get("job_try") or 1)
    if not is_transient_scrape_error(error) or attempt >= MAX_ATTEMPTS:
        await send_to_dlq(
            ctx,
            product_id=product_id,
            competitor_product_id=competitor_product_id,
            tenant_id=tenant_id,
            error=error,
            attempts=attempt,
        )
        return
    delay = retry_delay(attempt)
    logger.warning(
        "scrape_retry_scheduled",
        action="scrape_retry_scheduled",
        tenant_id=tenant_id,
        attempt=attempt,
        delay_seconds=delay,
        error=error,
    )
    raise Retry(defer=delay)
