"""ARQ scrape jobs."""

from dataclasses import asdict
from contextlib import suppress
from datetime import datetime, timezone
from urllib.parse import urlparse

import structlog.contextvars
from arq import Retry

from agents.alert_agent import AlertAgent
from agents.scraper_agent import ScrapeTarget, ScraperAgent
from auth.scrape_quota import release_scrape_slots, reserve_scrape_slots
from db import queries
from db.client import supabase_context
from jobs.retry import maybe_retry_or_dlq
from scrapers.policy import evaluate_source_policy, policy_check_due
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
        expected_currency=row.get("expected_currency"),
        expected_variant=row.get("expected_variant"),
        source_validation_state=row.get("source_validation_state", "unvalidated"),
        approved_host=row.get("approved_host"),
    )


async def _ensure_source_policy(tenant_id: str, row: dict) -> tuple[bool, dict]:
    policy = await queries.get_source_policy(tenant_id, row["competitor_product_id"])
    if policy_check_due(policy):
        decision = await evaluate_source_policy(row["url"])
        policy = await queries.upsert_source_policy(
            tenant_id,
            row["competitor_product_id"],
            {
                "robots_result": decision.robots_result,
                "robots_checked_at": decision.checked_at.isoformat(),
                "crawl_delay_seconds": decision.crawl_delay_seconds,
                "approved_host": decision.approved_host,
                "block_reason": decision.block_reason,
            },
        )
        await queries.insert_audit_event(
            {
                "tenant_id": tenant_id,
                "action": "source_policy.checked",
                "resource_type": "competitor_product",
                "resource_id": row["competitor_product_id"],
                "metadata": {
                    "robots_result": decision.robots_result,
                    "approved_host": decision.approved_host,
                },
            }
        )
    override = policy.get("operator_override")
    customer_authorized = bool(policy.get("customer_authorized_at"))
    allowed = override != "block" and (
        policy.get("robots_result") == "allowed"
        or (override == "allow" and customer_authorized)
    )
    return allowed, policy


async def _acquire_domain_slot(redis, host: str, requests_per_minute: int) -> str:
    minute = int(datetime.now(timezone.utc).timestamp() // 60)
    rate_key = f"pricevault:domain-rate:{host}:{minute}"
    count = await redis.incr(rate_key)
    if count == 1:
        await redis.expire(rate_key, 120)
    if count > requests_per_minute:
        raise Retry(defer=60)
    lock_key = f"pricevault:domain-lock:{host}"
    acquired = await redis.set(lock_key, "1", px=120_000, nx=True)
    if not acquired:
        raise Retry(defer=5)
    return lock_key


async def scrape_target(
    ctx: dict,
    *,
    competitor_product_id: str,
    tenant_id: str,
    evaluate_alerts: bool = True,
    quota_reserved: bool = False,
) -> dict[str, object]:
    structlog.contextvars.bind_contextvars(
        tenant_id=tenant_id,
        competitor_product_id=competitor_product_id,
        arq_job_try=int(ctx.get("job_try") or 1),
    )
    try:
        with supabase_context(admin=True):
            return await _scrape_target(
                ctx,
                competitor_product_id=competitor_product_id,
                tenant_id=tenant_id,
                evaluate_alerts=evaluate_alerts,
                quota_reserved=quota_reserved,
            )
    finally:
        structlog.contextvars.clear_contextvars()


async def _scrape_target(
    ctx: dict,
    *,
    competitor_product_id: str,
    tenant_id: str,
    evaluate_alerts: bool,
    quota_reserved: bool,
) -> dict[str, object]:
    with suppress(Exception):
        await queries.insert_usage_event(tenant_id, "queue_jobs")
    scrape_job = None
    with suppress(Exception):
        scrape_job = await queries.start_scrape_job(tenant_id, competitor_product_id)
    if scrape_job:
        structlog.contextvars.bind_contextvars(scrape_job_id=scrape_job["id"])
    rows = await queries.get_scrape_targets(tenant_id, [competitor_product_id])
    if not rows:
        error = "Aktive Preisquelle nicht gefunden"
        with suppress(Exception):
            await queries.mark_source_scrape_failure(
                tenant_id,
                competitor_product_id,
                error,
                failed_at=datetime.now(timezone.utc).isoformat(),
            )
        with suppress(Exception):
            await AlertAgent().run(tenant_id)
        await maybe_retry_or_dlq(
            ctx,
            tenant_id=tenant_id,
            competitor_product_id=competitor_product_id,
            error=error,
        )
        if scrape_job:
            with suppress(Exception):
                await queries.finish_scrape_job(
                    scrape_job["id"],
                    {"state": "failed", "failure_reason": error},
                )
        return {"scrape_ok": False, "error": error}

    allowed, policy = await _ensure_source_policy(tenant_id, rows[0])
    rows[0]["approved_host"] = policy["approved_host"]
    if not allowed:
        error = policy.get("block_reason") or "Preisquelle ist durch die Abrufrichtlinie blockiert"
        await queries.update_product_mapping(
            tenant_id,
            competitor_product_id,
            {"health_status": "blocked", "last_failure_reason": error, "broken_reason": error},
        )
        if scrape_job:
            await queries.finish_scrape_job(scrape_job["id"], {"state": "failed", "failure_reason": error})
        return {"scrape_ok": False, "blocked": True, "error": error}

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
                if scrape_job:
                    with suppress(Exception):
                        await queries.finish_scrape_job(
                            scrape_job["id"],
                            {
                                "state": "failed",
                                "failure_reason": "Tageslimit für Preisabrufe erreicht",
                            },
                        )
                return {
                    "scrape_ok": False,
                    "error": "Tageslimit für Preisabrufe erreicht",
                }

    domain_lock = None
    redis = ctx.get("redis")
    if redis:
        host = (urlparse(rows[0]["url"]).hostname or "unknown").lower()
        domain_lock = await _acquire_domain_slot(
            redis, host, int(policy.get("domain_requests_per_minute") or 20)
        )
    try:
        result = await ScraperAgent().scrape(_target_from_row(rows[0]))
    finally:
        if redis and domain_lock:
            await redis.delete(domain_lock)
    if not result.scrape_ok:
        with suppress(Exception):
            await queries.mark_source_scrape_failure(
                tenant_id,
                competitor_product_id,
                result.error_msg or "Preisabruf fehlgeschlagen",
                failed_at=result.scraped_at.isoformat(),
            )
        with suppress(Exception):
            await AlertAgent().run(tenant_id)
        if scrape_job:
            with suppress(Exception):
                await queries.finish_scrape_job(
                    scrape_job["id"],
                    {
                        "state": "retrying" if attempt < 3 else "failed",
                        "failure_reason": result.error_msg,
                        "retry_count": max(0, attempt - 1),
                    },
                )
        await maybe_retry_or_dlq(
            ctx,
            tenant_id=tenant_id,
            competitor_product_id=competitor_product_id,
            error=result.error_msg or "Preisabruf fehlgeschlagen",
        )
    elif result.validation_state != "valid":
        with suppress(Exception):
            await queries.update_product_mapping(
                tenant_id,
                competitor_product_id,
                {
                    "health_status": "degraded",
                    "last_failure_reason": result.validation_reason,
                },
            )
        if scrape_job:
            with suppress(Exception):
                await queries.finish_scrape_job(
                    scrape_job["id"],
                    {
                        "state": "succeeded",
                        "failure_reason": result.validation_reason,
                        "last_successful_price": None,
                    },
                )
    elif evaluate_alerts:
        with suppress(Exception):
            await queries.mark_source_scrape_success(
                tenant_id,
                competitor_product_id,
                result.scraped_at.isoformat(),
            )
        if scrape_job:
            with suppress(Exception):
                await queries.finish_scrape_job(
                    scrape_job["id"],
                    {
                        "state": "succeeded",
                        "last_successful_price": result.price,
                    },
                )
        await AlertAgent().run(tenant_id)
        with suppress(Exception):
            tenant = await queries.get_tenant_by_id(tenant_id)
            await queries.record_product_event(tenant_id, "first_validated_scrape", (tenant or {}).get("plan"))
        if ctx.get("redis"):
            await ctx["redis"].enqueue_job(
                "generate_product_insight",
                tenant_id=tenant_id,
                competitor_product_id=competitor_product_id,
                _job_id=f"insight-{competitor_product_id}-{int(result.scraped_at.timestamp())}",
            )
            minute_bucket = int(result.scraped_at.timestamp() // 60)
            await ctx["redis"].enqueue_job(
                "generate_reprice_suggestions",
                tenant_id=tenant_id,
                _job_id=f"repricing-{tenant_id}-{minute_bucket}",
            )
    elif scrape_job:
        with suppress(Exception):
            await queries.mark_source_scrape_success(
                tenant_id,
                competitor_product_id,
                result.scraped_at.isoformat(),
            )
        with suppress(Exception):
            await queries.finish_scrape_job(
                scrape_job["id"],
                {
                    "state": "succeeded",
                    "last_successful_price": result.price,
                },
            )
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
            rows = await queries.get_due_scrape_targets(tenant["id"])
            reserved = await reserve_scrape_slots(
                ctx["redis"],
                tenant_id=tenant["id"],
                plan=tenant.get("plan"),
                requested=len(rows),
            )
            accepted = 0
            try:
                for row in rows[:reserved]:
                    frequency_h = max(1, int(row.get("scrape_freq_h") or 12))
                    bucket = int(datetime.now(timezone.utc).timestamp() // (frequency_h * 3600))
                    job = await ctx["redis"].enqueue_job(
                        "scrape_target",
                        competitor_product_id=row["competitor_product_id"],
                        tenant_id=tenant["id"],
                        quota_reserved=True,
                        _job_id=f"scrape-{row['competitor_product_id']}-{bucket}",
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
