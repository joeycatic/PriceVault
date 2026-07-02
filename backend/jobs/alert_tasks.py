"""Alert channel delivery jobs."""

from datetime import datetime, timedelta, timezone

import httpx

from db import queries
from security.crypto import decrypt_secret
from security.urls import validate_delivery_url
from utils.logger import get_logger


logger = get_logger("jobs.alerts")


def _channel_url(channel: dict) -> str:
    key = "webhook_url" if channel["type"] == "slack" else "url"
    config = channel.get("config") or {}
    value = config.get(key)
    if isinstance(value, str):
        return value
    ciphertext = config.get(f"{key}_ciphertext")
    if isinstance(ciphertext, str):
        return decrypt_secret(ciphertext)
    raise ValueError("Webhook-URL fehlt")


async def deliver_alert(
    ctx: dict,
    *,
    channel: dict,
    payload: dict,
    tenant_id: str | None = None,
    delivery_id: str | None = None,
) -> dict[str, bool]:
    attempt = int(ctx.get("job_try") or 1)
    if delivery_id:
        await queries.update_alert_channel_delivery(
            delivery_id,
            {"status": "running", "attempt_count": attempt},
        )
    try:
        if channel["type"] == "webhook":
            url = _channel_url(channel)
            validate_delivery_url(url)
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=10)
                response.raise_for_status()
        elif channel["type"] == "slack":
            url = _channel_url(channel)
            validate_delivery_url(url, slack=True)
            message = {
                "text": (
                    f"*{payload['product_name']}* Preisänderung: "
                    f"{payload['old_price']:.2f} EUR -> {payload['new_price']:.2f} EUR "
                    f"({payload['delta_pct']:+.1f}%)\n{payload['product_url']}"
                )
            }
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=message, timeout=10)
                response.raise_for_status()
    except Exception as exc:
        if delivery_id:
            await queries.update_alert_channel_delivery(
                delivery_id,
                {
                    "status": "failed",
                    "attempt_count": attempt,
                    "last_error": str(exc)[:1000],
                    "next_retry_at": (
                        datetime.now(timezone.utc) + timedelta(minutes=5 * attempt)
                    ).isoformat()
                    if attempt < 3
                    else None,
                },
            )
        raise
    if delivery_id:
        await queries.update_alert_channel_delivery(
            delivery_id,
            {
                "status": "succeeded",
                "attempt_count": attempt,
                "last_error": None,
                "next_retry_at": None,
                "delivered_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    logger.info(
        "alert_delivered",
        action="alert_delivered",
        tenant_id=tenant_id,
        channel_type=channel["type"],
    )
    return {"delivered": True}
