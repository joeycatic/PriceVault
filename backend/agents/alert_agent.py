"""Price threshold evaluation and Resend email delivery."""

import asyncio
import os
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from typing import Any

from arq import create_pool
from arq.connections import RedisSettings
import resend

from db import queries
from emails.settings import app_url, resend_sender
from jobs.alert_tasks import deliver_alert
from utils.logger import get_logger


logger = get_logger("alert_agent")


class AlertAgent:
    """Evaluate every active alert for a tenant after a scrape batch."""

    @staticmethod
    def evaluate(alert: dict[str, Any], row: dict[str, Any]) -> bool:
        if alert["condition"] == "out_of_stock":
            return row.get("in_stock") is False
        if alert["condition"] == "back_in_stock":
            return row.get("in_stock") is True
        if row.get("delta_pct") is None or row.get("competitor_price") is None:
            return False
        delta = float(row["delta_pct"])
        threshold = float(alert["threshold"] or 0)
        if alert["condition"] == "below_pct":
            return delta < -threshold
        if alert["condition"] == "above_pct":
            return delta > threshold
        if alert["condition"] in {"below_abs", "undercut_abs"}:
            return float(row["our_price"]) - float(row["competitor_price"]) > threshold
        if alert["condition"] == "above_abs":
            return float(row["competitor_price"]) - float(row["our_price"]) > threshold
        return False

    @staticmethod
    def _matches_scope(alert: dict[str, Any], row: dict[str, Any]) -> bool:
        return (
            (alert.get("product_id") is None or alert["product_id"] == row["product_id"])
            and (
                alert.get("competitor_id") is None
                or alert["competitor_id"] == row["competitor_id"]
            )
        )

    @staticmethod
    def _cooldown_elapsed(alert: dict[str, Any]) -> bool:
        last_triggered = alert.get("last_triggered_at")
        if not last_triggered:
            return True
        parsed = datetime.fromisoformat(last_triggered.replace("Z", "+00:00"))
        return datetime.now(timezone.utc) >= parsed + timedelta(hours=alert["cooldown_h"])

    async def _send_email(self, alert: dict[str, Any], row: dict[str, Any]) -> None:
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key:
            raise RuntimeError("RESEND_API_KEY is not configured")
        resend.api_key = api_key
        subject = f"Preisalarm: {row['product_name']} bei {row['competitor_shop']}"
        text = (
            f"{row['competitor_shop']} verkauft \"{row['product_name']}\" jetzt für "
            f"{float(row['competitor_price']):.2f} €.\n"
            f"Dein Preis: {float(row['our_price']):.2f} €\n"
            f"Differenz: {float(row['delta_pct']):.2f}%\n\n"
            f"→ Zum Dashboard: {app_url('/dashboard')}\n\n"
            "Du erhältst diese E-Mail, weil du einen Preisalarm für dieses Produkt "
            "eingerichtet hast."
        )
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": resend_sender(),
                "to": [alert["notify_email"]],
                "subject": subject,
                "text": text,
            },
        )

    async def _deliver_channels(self, tenant_id: str, row: dict[str, Any]) -> None:
        channels = [
            channel
            for channel in await queries.list_alert_channels(tenant_id)
            if channel.get("active") and channel.get("type") in {"webhook", "slack"}
        ]
        if not channels:
            return
        payload = {
            "product_name": row["product_name"],
            "old_price": float(row["our_price"] or 0),
            "new_price": float(row["competitor_price"] or 0),
            "delta_pct": float(row["delta_pct"] or 0),
            "product_url": row["competitor_url"],
        }
        alert_event_id = row.get("_alert_event_id")
        redis_url = os.environ.get("REDIS_URL")
        if redis_url:
            redis = await create_pool(RedisSettings.from_dsn(redis_url))
            try:
                for channel in channels:
                    delivery = await queries.create_alert_channel_delivery(
                        tenant_id,
                        {
                            "alert_event_id": alert_event_id,
                            "channel_id": channel.get("id"),
                            "channel_type": channel["type"],
                            "status": "queued",
                            "payload": payload,
                        },
                    )
                    await redis.enqueue_job(
                        "deliver_alert",
                        channel=channel,
                        payload=payload,
                        tenant_id=tenant_id,
                        delivery_id=delivery.get("id"),
                    )
            finally:
                await redis.aclose()
            return
        for channel in channels:
            delivery = await queries.create_alert_channel_delivery(
                tenant_id,
                {
                    "alert_event_id": alert_event_id,
                    "channel_id": channel.get("id"),
                    "channel_type": channel["type"],
                    "status": "queued",
                    "payload": payload,
                },
            )
            await deliver_alert(
                {},
                channel=channel,
                payload=payload,
                tenant_id=tenant_id,
                delivery_id=delivery.get("id"),
            )

    async def run(self, tenant_id: str) -> dict[str, int]:
        rows, alerts = await asyncio.gather(
            queries.get_latest_prices(tenant_id),
            queries.list_alerts(tenant_id, active_only=True),
        )
        checked = 0
        triggered = 0
        for alert in alerts:
            if not self._cooldown_elapsed(alert):
                continue
            for row in rows:
                if not self._matches_scope(alert, row):
                    continue
                checked += 1
                if not self.evaluate(alert, row):
                    continue

                email_sent = True
                try:
                    await self._send_email(alert, row)
                except Exception as exc:
                    email_sent = False
                    logger.error(
                        "email_failed",
                        action="email_failed",
                        tenant_id=tenant_id,
                        error=str(exc),
                    )
                now = datetime.now(timezone.utc).isoformat()
                event = await queries.insert_alert_event(
                    {
                        "alert_id": alert["id"],
                        "tenant_id": tenant_id,
                        "competitor_product_id": row["competitor_product_id"],
                        "our_price": row["our_price"],
                        "competitor_price": row["competitor_price"],
                        "delta_pct": row["delta_pct"],
                        "email_sent": email_sent,
                        "trigger_reason": alert["condition"],
                        "triggered_at": now,
                    }
                )
                with suppress(Exception):
                    await queries.create_alert_channel_delivery(
                        tenant_id,
                        {
                            "alert_event_id": event.get("id"),
                            "channel_type": "email",
                            "status": "succeeded" if email_sent else "failed",
                            "attempt_count": 1,
                            "payload": {"to": alert["notify_email"]},
                            "last_error": None if email_sent else "E-Mail konnte nicht gesendet werden",
                            "delivered_at": now if email_sent else None,
                        },
                    )
                row_for_delivery = {**row, "_alert_event_id": event.get("id")}
                try:
                    await self._deliver_channels(tenant_id, row_for_delivery)
                except Exception as exc:
                    logger.error(
                        "channel_delivery_failed",
                        action="channel_delivery_failed",
                        tenant_id=tenant_id,
                        error=str(exc),
                    )
                await queries.update_alert(tenant_id, alert["id"], {"last_triggered_at": now})
                triggered += 1
                break
        return {"checked": checked, "triggered": triggered}


async def _main() -> None:
    tenants = await queries.list_tenants()
    if not tenants:
        logger.info("no_tenant_found", action="no_tenant_found")
        return
    result = await AlertAgent().run(tenants[0]["id"])
    logger.info("alert_agent_complete", action="alert_agent_complete", **result)


if __name__ == "__main__":
    asyncio.run(_main())
