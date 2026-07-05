"""Sustained 15-minute queue capacity evaluation and operations notification."""

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

import resend

from db import queries
from emails.settings import resend_sender
from jobs.worker_status import worker_autoscaling_signals


async def evaluate_capacity(ctx: dict) -> dict[str, object]:
    redis = ctx["redis"]
    now = datetime.now(timezone.utc)
    signals = await worker_autoscaling_signals(redis, max_jobs=int(os.getenv("ARQ_MAX_JOBS", "10")))
    sample = {"at": now.isoformat(), "utilization": float(signals["queue_saturation"])}
    key = "pricevault:capacity:queue:samples"
    await redis.zadd(key, {json.dumps(sample): now.timestamp()})
    await redis.zremrangebyscore(key, 0, (now - timedelta(minutes=20)).timestamp())
    raw = await redis.zrange(key, 0, -1)
    samples = [json.loads(item.decode() if isinstance(item, bytes) else item) for item in raw]
    window = [row for row in samples if datetime.fromisoformat(row["at"]) >= now - timedelta(minutes=15)]
    warning = float(os.getenv("CAPACITY_WARNING_THRESHOLD", "0.70"))
    critical = float(os.getenv("CAPACITY_CRITICAL_THRESHOLD", "0.90"))
    sustained = len(window) >= 3 and datetime.fromisoformat(window[0]["at"]) <= now - timedelta(minutes=10)
    minimum = min((float(row["utilization"]) for row in window), default=0)
    state = "critical" if sustained and minimum >= critical else "warning" if sustained and minimum >= warning else "normal"
    notification_status = "not_required"
    if state != "normal":
        recipient = os.getenv("OPS_ALERT_EMAIL")
        if recipient and os.getenv("RESEND_API_KEY"):
            try:
                resend.api_key = os.environ["RESEND_API_KEY"]
                await asyncio.to_thread(resend.Emails.send, {"from": resend_sender(), "to": [recipient], "subject": f"PriceVault Kapazität {state}", "text": f"Die Queue-Auslastung lag 15 Minuten durchgehend bei mindestens {minimum:.0%}."})
                notification_status = "sent"
            except Exception:
                notification_status = "failed"
        else:
            notification_status = "pending"
    evaluation = await queries.upsert_capacity_evaluation({
        "window_started_at": (now - timedelta(minutes=15)).replace(second=0, microsecond=0).isoformat(),
        "window_ended_at": now.isoformat(), "metric": "queue_saturation",
        "utilization": float(signals["queue_saturation"]), "state": state,
        "notification_status": notification_status, "evidence": {"samples": window, "warning": warning, "critical": critical},
    })
    return evaluation
