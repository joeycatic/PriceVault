"""Compatibility helpers for scheduling ARQ scrape jobs."""

import os

from arq import create_pool
from arq.connections import RedisSettings

from db import queries
from db.client import supabase_context


async def enqueue_all_scrapes(redis_url: str | None = None) -> int:
    """Queue one ARQ scrape job per active competitor product."""
    redis = await create_pool(RedisSettings.from_dsn(redis_url or os.environ["REDIS_URL"]))
    queued = 0
    try:
        with supabase_context(admin=True):
            tenants = await queries.list_tenants()
            for tenant in tenants:
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


async def scrape_all_job() -> None:
    """Legacy entry point retained for scripts that imported the old scheduler."""
    await enqueue_all_scrapes()
