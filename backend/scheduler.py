"""APScheduler jobs for twice-daily price collection."""

import asyncio
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from agents.alert_agent import AlertAgent
from agents.scraper_agent import ScrapeTarget, ScraperAgent
from db import queries
from utils.logger import get_logger


logger = get_logger("scheduler")
scheduler = AsyncIOScheduler(timezone="Europe/Berlin")


def _target_from_row(row: dict) -> ScrapeTarget:
    return ScrapeTarget(
        competitor_product_id=row["competitor_product_id"],
        url=row["url"],
        selector_price=row.get("selector_price"),
        selector_stock=row.get("selector_stock"),
        tenant_id=row["tenant_id"],
        competitor_id=row.get("competitor_id"),
    )


@scheduler.scheduled_job(
    "interval", hours=12, id="scrape_all", max_instances=1, coalesce=True
)
async def scrape_all_job() -> None:
    tenants = await queries.list_tenants()
    concurrency = asyncio.Semaphore(int(os.getenv("SCRAPE_CONCURRENCY", "3")))
    scraper = ScraperAgent()
    alerts = AlertAgent()

    for tenant in tenants:
        tenant_id = tenant["id"]
        rows = await queries.get_scrape_targets(tenant_id)

        async def scrape_one(row: dict) -> None:
            async with concurrency:
                await scraper.scrape(_target_from_row(row))

        results = await asyncio.gather(
            *(scrape_one(row) for row in rows), return_exceptions=True
        )
        for result in results:
            if isinstance(result, Exception):
                logger.error(
                    "scheduled_scrape_failed",
                    extra={
                        "agent": "scheduler",
                        "action": "scheduled_scrape_failed",
                        "tenant_id": tenant_id,
                        "error": str(result),
                    },
                )
        await alerts.run(tenant_id)

