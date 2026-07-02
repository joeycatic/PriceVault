"""Alert channel delivery jobs."""

import httpx

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


async def deliver_alert(ctx: dict, *, channel: dict, payload: dict) -> dict[str, bool]:
    del ctx
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
    logger.info(
        "alert_delivered",
        action="alert_delivered",
        channel_type=channel["type"],
    )
    return {"delivered": True}
