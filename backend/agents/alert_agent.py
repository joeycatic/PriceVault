"""Price threshold evaluation and Resend email delivery."""

import asyncio
import os
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from typing import Any

from arq import create_pool
from arq.connections import RedisSettings

from db import queries
from emails.settings import app_url
from jobs.alert_tasks import deliver_alert, deliver_alert_email
from utils.logger import get_logger


logger = get_logger("alert_agent")


def is_map_violation(*, map_price: float | None, advertised_price: float | None) -> bool:
    if map_price is None or advertised_price is None:
        return False
    return float(advertised_price) < float(map_price)


class AlertAgent:
    """Evaluate every active alert for a tenant after a scrape batch."""

    @staticmethod
    def evaluate(alert: dict[str, Any], row: dict[str, Any]) -> bool:
        if alert["condition"] == "out_of_stock":
            return row.get("previous_in_stock") is True and row.get("in_stock") is False
        if alert["condition"] == "back_in_stock":
            return row.get("previous_in_stock") is False and row.get("in_stock") is True
        if alert["condition"] == "sale_started":
            return (
                row.get("price_type") == "sale"
                and row.get("previous_price_type") is not None
                and row.get("previous_price_type") != "sale"
            )
        if alert["condition"] == "sale_ended":
            return (
                row.get("previous_price_type") == "sale"
                and row.get("price_type") is not None
                and row.get("price_type") != "sale"
            )
        if alert["condition"] == "map_violation":
            return is_map_violation(
                map_price=row.get("map_price"),
                advertised_price=row.get("competitor_price"),
            )
        if alert.get("condition") == "source_broken":
            return row.get("health_status") == "broken" and int(
                row.get("consecutive_failures") or 0
            ) >= int(alert.get("threshold") or 3)
        if alert["condition"] in {"price_drop", "price_rise"}:
            current = row.get("competitor_price")
            previous = row.get("previous_competitor_price")
            if current is None or previous is None:
                return False
            change = float(current) - float(previous)
            if alert["condition"] == "price_drop":
                change = -change
            if change <= 0:
                return False
            threshold = float(alert.get("threshold") or 0)
            if alert.get("threshold_unit") == "absolute":
                return change >= threshold
            return (change / float(previous) * 100) >= threshold if float(previous) else False
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

    def _email_content(self, alert: dict[str, Any], row: dict[str, Any]) -> tuple[str, str]:
        subject = f"Preisalarm: {row['product_name']} bei {row['competitor_shop']}"
        details = []
        if row.get("competitor_price") is not None:
            details.append(f"Aktueller Mitbewerberpreis: {float(row['competitor_price']):.2f} €")
        if row.get("previous_competitor_price") is not None:
            details.append(f"Vorheriger Mitbewerberpreis: {float(row['previous_competitor_price']):.2f} €")
        if row.get("our_price") is not None:
            details.append(f"Dein Preis: {float(row['our_price']):.2f} €")
        if alert.get("condition") == "source_broken":
            details.append(
                f"Fehlgeschlagene Abrufe in Folge: {int(row.get('consecutive_failures') or 0)}"
            )
        if alert.get("condition") in {"sale_started", "sale_ended"}:
            details.append(
                "Aktionsstart beim Mitbewerber erkannt."
                if alert["condition"] == "sale_started"
                else "Aktionsende beim Mitbewerber erkannt."
            )
        if alert.get("condition") == "map_violation" and row.get("map_price") is not None:
            details.append(
                f"Mindestwerbepreis (MAP): {float(row['map_price']):.2f} € — "
                f"beworbener Preis: {float(row['competitor_price']):.2f} €"
            )
        text = "\n".join(
            [
                f"Für {row['product_name']} bei {row['competitor_shop']} wurde deine Alarmregel ausgelöst.",
                "",
                *details,
                "",
                f"Zum Dashboard: {app_url('/dashboard/alerts')}",
                "",
                "Du erhältst diese E-Mail aufgrund einer von dir eingerichteten Alarmregel.",
            ]
        )
        return subject, text

    async def _deliver_email(
        self,
        tenant_id: str,
        alert: dict[str, Any],
        row: dict[str, Any],
        alert_event_id: str | None,
    ) -> bool:
        subject, text = self._email_content(alert, row)
        delivery = await queries.create_alert_channel_delivery(
            tenant_id,
            {
                "alert_event_id": alert_event_id,
                "channel_type": "email",
                "status": "queued",
                "attempt_count": 0,
                "payload": {"to": alert["notify_email"], "subject": subject},
            },
        )
        redis_url = os.environ.get("REDIS_URL")
        if redis_url:
            redis = await create_pool(RedisSettings.from_dsn(redis_url))
            try:
                await redis.enqueue_job(
                    "deliver_alert_email",
                    tenant_id=tenant_id,
                    delivery_id=delivery["id"],
                    to=alert["notify_email"],
                    subject=subject,
                    text=text,
                    _job_id=f"alert-email-{delivery['id']}",
                )
            finally:
                await redis.aclose()
            return True
        try:
            await deliver_alert_email(
                {},
                tenant_id=tenant_id,
                delivery_id=delivery["id"],
                to=alert["notify_email"],
                subject=subject,
                text=text,
            )
            return True
        except Exception as exc:
            logger.error(
                "email_failed",
                action="email_failed",
                tenant_id=tenant_id,
                error=str(exc),
            )
            return False

    async def _deliver_channels(self, tenant_id: str, row: dict[str, Any]) -> None:
        channels = [
            channel
            for channel in await queries.list_alert_channels(tenant_id)
            if channel.get("active") and channel.get("type") in {"webhook", "slack", "teams"}
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
        rows, alerts, snapshots = await asyncio.gather(
            queries.get_latest_prices(tenant_id),
            queries.list_alerts(tenant_id, active_only=True),
            queries.list_recent_snapshots(tenant_id),
        )
        history: dict[str, list[dict[str, Any]]] = {}
        for snapshot in snapshots:
            if snapshot.get("scrape_ok") and snapshot.get("validation_state") == "valid":
                history.setdefault(snapshot["competitor_product_id"], []).append(snapshot)
        for row in rows:
            source_history = history.get(row["competitor_product_id"], [])
            previous = source_history[1] if len(source_history) > 1 else {}
            row["previous_competitor_price"] = previous.get("price")
            row["previous_in_stock"] = previous.get("in_stock")
            row["previous_price_type"] = previous.get("price_type")
        for row in rows:
            if not is_map_violation(
                map_price=row.get("map_price"),
                advertised_price=row.get("competitor_price"),
            ):
                continue
            existing = await queries.get_open_map_violation(
                tenant_id,
                row["variant_id"],
                row["competitor_product_id"],
            )
            if existing:
                continue
            await queries.create_map_violation(
                tenant_id,
                {
                    "product_id": row["product_id"],
                    "variant_id": row["variant_id"],
                    "competitor_product_id": row["competitor_product_id"],
                    "snapshot_id": row.get("snapshot_id"),
                    "map_price": row["map_price"],
                    "advertised_price": row["competitor_price"],
                },
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

                now = datetime.now(timezone.utc).isoformat()
                event = await queries.insert_alert_event(
                    {
                        "alert_id": alert["id"],
                        "tenant_id": tenant_id,
                        "competitor_product_id": row["competitor_product_id"],
                        "our_price": row["our_price"],
                        "competitor_price": row["competitor_price"],
                        "previous_competitor_price": row.get("previous_competitor_price"),
                        "previous_in_stock": row.get("previous_in_stock"),
                        "delta_pct": row["delta_pct"],
                        "email_sent": False,
                        "trigger_reason": alert["condition"],
                        "triggered_at": now,
                    }
                )
                email_sent = await self._deliver_email(
                    tenant_id, alert, row, event.get("id")
                )
                if email_sent:
                    with suppress(Exception):
                        await queries.update_alert_event(
                            tenant_id,
                            event["id"],
                            {"email_sent": True},
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
                with suppress(Exception):
                    tenant = await queries.get_tenant_by_id(tenant_id)
                    await queries.record_product_event(tenant_id, "first_alert", (tenant or {}).get("plan"))
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
