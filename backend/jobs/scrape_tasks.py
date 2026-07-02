"""ARQ scrape jobs."""

from dataclasses import asdict

from agents.alert_agent import AlertAgent
from agents.scraper_agent import ScrapeTarget, ScraperAgent
from auth.scrape_quota import release_scrape_slots, reserve_scrape_slots
from db import queries
from db.client import supabase_context
from jobs.retry import maybe_retry_or_dlq
from utils.logger import get_logger


logger = get_logger("jobs.scrape")


def _target_from_row(row: dict) -> ScrapeTarget:
    return ScrapeTarget(
        competitor_product_id=row["competitor_product_id"],
        url=row["url"],
        selector_price=row.get("selector_price"),
        selector_stock=row.get("selector_stock"),
        tenant_id=row["tenant_id"],
        competitor_id=row.get("competitor_id"),
    )


async def scrape_target(
    ctx: dict,
    *,
    competitor_product_id: str,
    tenant_id: str,
    evaluate_alerts: bool = True,
    quota_reserved: bool = False,
) -> dict[str, object]:
    with supabase_context(admin=True):
        rows = await queries.get_scrape_targets(tenant_id, [competitor_product_id])
        if not rows:
            error = "Aktive Preisquelle nicht gefunden"
            await maybe_retry_or_dlq(
                ctx,
                tenant_id=tenant_id,
                competitor_product_id=competitor_product_id,
                error=error,
            )
            return {"scrape_ok": False, "error": error}

        attempt = int(ctx.get("job_try") or 1)
        if not quota_reserved or attempt > 1:
            redis = ctx.get("redis")
            if redis:
                tenant = await queries.get_tenant_by_id(tenant_id)
                reserved = await reserve_scrape_slots(
                    redis,
                    tenant_id=tenant_id,
                    plan=tenant.get("plan") if tenant else None,
                    requested=1,
                )
                if not reserved:
                    return {
                        "scrape_ok": False,
                        "error": "Tageslimit für Preisabrufe erreicht",
                    }

        result = await ScraperAgent().scrape(_target_from_row(rows[0]))
        if not result.scrape_ok:
            await maybe_retry_or_dlq(
                ctx,
                tenant_id=tenant_id,
                competitor_product_id=competitor_product_id,
                error=result.error_msg or "Preisabruf fehlgeschlagen",
            )
        elif evaluate_alerts:
            await AlertAgent().run(tenant_id)
        return asdict(result)


async def scrape_product(ctx: dict, *, product_id: str, tenant_id: str) -> dict[str, object]:
    with supabase_context(admin=True):
        mappings = await queries.list_product_mappings(tenant_id, product_id)
        active_ids = [row["id"] for row in mappings if row.get("active", True)]
        results = []
        for mapping_id in active_ids:
            results.append(
                await scrape_target(
                    ctx,
                    competitor_product_id=mapping_id,
                    tenant_id=tenant_id,
                    evaluate_alerts=False,
                    quota_reserved=False,
                )
            )
        await AlertAgent().run(tenant_id)
        return {"triggered": len(results), "results": results}


async def scrape_all(ctx: dict) -> dict[str, int]:
    with supabase_context(admin=True):
        tenants = await queries.list_tenants()
        queued = 0
        for tenant in tenants:
            rows = await queries.get_scrape_targets(tenant["id"])
            reserved = await reserve_scrape_slots(
                ctx["redis"],
                tenant_id=tenant["id"],
                plan=tenant.get("plan"),
                requested=len(rows),
            )
            accepted = 0
            try:
                for row in rows[:reserved]:
                    job = await ctx["redis"].enqueue_job(
                        "scrape_target",
                        competitor_product_id=row["competitor_product_id"],
                        tenant_id=tenant["id"],
                        quota_reserved=True,
                    )
                    if job:
                        queued += 1
                        accepted += 1
            finally:
                await release_scrape_slots(
                    ctx["redis"],
                    tenant_id=tenant["id"],
                    count=max(0, reserved - accepted),
                )
    logger.info("scrape_all_complete", action="scrape_all", queued=queued)
    return {"queued": queued}
