"""APScheduler process that dispatches idempotent ARQ work."""

import asyncio
import os
import signal

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from arq import create_pool
from arq.connections import RedisSettings

from db import queries
from db.client import supabase_context
from jobs.billing_tasks import enqueue_due_viva_renewals
from jobs.digest_tasks import enqueue_due_alert_digests
from jobs.report_tasks import enqueue_due_reports
from jobs.scrape_tasks import scrape_all
from logging_config import configure_logging
from utils.logger import get_logger


configure_logging()
logger = get_logger("scheduler")


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(os.environ.get("REDIS_URL", "redis://localhost:6379"))


async def _run_job(name: str, function, redis) -> None:
    try:
        with supabase_context(admin=True):
            result = await function({"redis": redis})
        logger.info("scheduled_dispatch_complete", action=name, result=result)
    except Exception as exc:
        logger.exception("scheduled_dispatch_failed", action=name, error=str(exc))


async def enqueue_all_scrapes(redis_url: str) -> int:
    """One-shot dispatcher retained for operational/manual use."""
    redis = await create_pool(RedisSettings.from_dsn(redis_url))
    queued = 0
    try:
        with supabase_context(admin=True):
            for tenant in await queries.list_tenants():
                rows = await queries.get_scrape_targets(tenant["id"])
                for row in rows:
                    job = await redis.enqueue_job(
                        "scrape_target",
                        competitor_product_id=row["competitor_product_id"],
                        tenant_id=tenant["id"],
                        quota_reserved=False,
                    )
                    if job:
                        queued += 1
    finally:
        await redis.aclose()
    return queued


async def run_scheduler() -> None:
    redis = await create_pool(redis_settings())
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        _run_job,
        "interval",
        minutes=15,
        args=("alert_digests_due", enqueue_due_alert_digests, redis),
        id="alert-digests-due",
        coalesce=True,
        max_instances=1,
    )
    scheduler.add_job(
        _run_job,
        "interval",
        minutes=1,
        args=("scrape_due", scrape_all, redis),
        id="scrape-due",
        coalesce=True,
        max_instances=1,
    )
    scheduler.add_job(
        _run_job,
        "cron",
        hour=2,
        minute=15,
        args=("billing_due", enqueue_due_viva_renewals, redis),
        id="billing-due",
        coalesce=True,
        max_instances=1,
    )
    scheduler.add_job(
        _run_job,
        "cron",
        hour=6,
        minute=30,
        args=("reports_due", enqueue_due_reports, redis),
        id="reports-due",
        coalesce=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info("scheduler_started", action="scheduler_started")

    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for event in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(event, stopped.set)
    try:
        await stopped.wait()
    finally:
        scheduler.shutdown(wait=False)
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(run_scheduler())
