"""Alert channel delivery jobs."""

import asyncio
import json
import os
from contextlib import suppress
from datetime import datetime, timedelta, timezone

import httpx
import resend

from db import queries
from emails.settings import resend_sender
from security.crypto import decrypt_secret, sign_webhook_payload
from security.urls import validate_delivery_url
from utils.logger import get_logger


logger = get_logger("jobs.alerts")


def _channel_url(channel: dict) -> str:
    key = "webhook_url" if channel["type"] in {"slack", "teams"} else "url"
    config = channel.get("config") or {}
    value = config.get(key)
    if isinstance(value, str):
        return value
    ciphertext = config.get(f"{key}_ciphertext")
    if isinstance(ciphertext, str):
        return decrypt_secret(ciphertext)
    raise ValueError("Webhook-URL fehlt")


def _webhook_signing_secret(channel: dict) -> str | None:
    config = channel.get("config") or {}
    value = config.get("signing_secret")
    if isinstance(value, str):
        return value
    ciphertext = config.get("signing_secret_ciphertext")
    if isinstance(ciphertext, str):
        return decrypt_secret(ciphertext)
    return None


def teams_message_card(payload: dict) -> dict:
    return {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": f"Preisalarm: {payload['product_name']}",
        "themeColor": "0B6E4F",
        "title": f"Preisalarm: {payload['product_name']}",
        "text": (
            f"Preisänderung: {payload['old_price']:.2f} EUR -> {payload['new_price']:.2f} EUR "
            f"({payload['delta_pct']:+.1f} %)\n\n[Produkt öffnen]({payload['product_url']})"
        ),
    }


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
            body = json.dumps(payload, separators=(",", ":")).encode()
            headers = {"Content-Type": "application/json"}
            signing_secret = _webhook_signing_secret(channel)
            if signing_secret:
                timestamp = str(int(datetime.now(timezone.utc).timestamp()))
                signature = sign_webhook_payload(signing_secret, timestamp, body)
                headers.update(
                    {
                        "X-PriceVault-Timestamp": timestamp,
                        "X-PriceVault-Signature": f"sha256={signature}",
                    }
                )
            async with httpx.AsyncClient() as client:
                response = await client.post(url, content=body, headers=headers, timeout=10)
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
        elif channel["type"] == "teams":
            url = _channel_url(channel)
            validate_delivery_url(url)
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=teams_message_card(payload), timeout=10)
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


async def deliver_alert_email(
    ctx: dict,
    *,
    tenant_id: str,
    delivery_id: str,
    to: str,
    subject: str,
    text: str,
) -> dict[str, bool]:
    attempt = int(ctx.get("job_try") or 1) if isinstance(ctx, dict) else 1
    await queries.update_alert_channel_delivery(
        delivery_id,
        {"status": "running", "attempt_count": attempt},
    )
    try:
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key:
            raise RuntimeError("RESEND_API_KEY is not configured")
        resend.api_key = api_key
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": resend_sender(),
                "to": [to],
                "subject": subject,
                "text": text,
            },
        )
    except Exception as exc:
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
    with suppress(Exception):
        await queries.insert_usage_event(tenant_id, "emails")
    logger.info("alert_email_delivered", action="alert_email_delivered", tenant_id=tenant_id)
    return {"delivered": True}
