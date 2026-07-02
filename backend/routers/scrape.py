"""Manual scrape, selector test, and product matching endpoints."""

import asyncio
import os
from contextlib import suppress
from dataclasses import asdict

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException, Query, status

from agents.matcher_agent import MatchRequest, MatcherAgent
from agents.scraper_agent import ScrapeTarget, ScraperAgent
from auth.dependencies import get_current_tenant
from auth.scrape_quota import release_scrape_slots, reserve_scrape_slots
from db import queries
from models.schemas import MatchSearchRequest, ScrapeRunRequest, ScrapeTestRequest
from routers import get_tenant


router = APIRouter(tags=["scraping"])


def _target_from_row(row: dict) -> ScrapeTarget:
    return ScrapeTarget(
        competitor_product_id=row["competitor_product_id"],
        url=row["url"],
        selector_price=row.get("selector_price"),
        selector_stock=row.get("selector_stock"),
        tenant_id=row["tenant_id"],
        competitor_id=row.get("competitor_id"),
    )


@router.post("/scrape/run")
async def run_scrape(
    body: ScrapeRunRequest, tenant: dict = Depends(get_current_tenant)
) -> dict:
    tenant_id = tenant["id"]
    if body.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Mandant stimmt nicht überein")
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="REDIS_URL ist nicht konfiguriert",
        )
    rows = await queries.get_scrape_targets(tenant_id, body.competitor_product_ids)
    redis = await create_pool(RedisSettings.from_dsn(redis_url))
    reserved = 0
    accepted = 0
    try:
        reserved = await reserve_scrape_slots(
            redis,
            tenant_id=tenant_id,
            plan=tenant.get("plan"),
            requested=len(rows),
        )
        if reserved < len(rows):
            raise HTTPException(
                status_code=429,
                detail="Tageslimit für Preisabrufe erreicht",
            )
        jobs = []
        for row in rows:
            with suppress(Exception):
                await queries.create_scrape_job(
                    tenant_id,
                    row["competitor_product_id"],
                    "queued",
                )
            job = await redis.enqueue_job(
                "scrape_target",
                competitor_product_id=row["competitor_product_id"],
                tenant_id=tenant_id,
                quota_reserved=True,
            )
            jobs.append(job)
            if job:
                accepted += 1
    finally:
        await release_scrape_slots(
            redis, tenant_id=tenant_id, count=max(0, reserved - accepted)
        )
        await redis.aclose()
    return {"queued": len([job for job in jobs if job]), "triggered": len(rows)}


@router.get("/scrape/jobs")
async def list_jobs(
    limit: int = Query(default=100, ge=1, le=500),
    tenant: dict = Depends(get_current_tenant),
) -> list[dict]:
    return await queries.list_scrape_jobs(tenant["id"], limit)


@router.post("/scrape/test")
async def test_scrape(body: ScrapeTestRequest, tenant_id: str = Depends(get_tenant)) -> dict:
    target = ScrapeTarget(
        competitor_product_id="selector-test",
        url=str(body.url),
        selector_price=body.selector_price,
        selector_stock=body.selector_stock,
        tenant_id=tenant_id,
    )
    result = await ScraperAgent().scrape(target, persist=False)
    payload = asdict(result)
    payload.pop("competitor_product_id")
    payload.pop("currency")
    payload.pop("scraped_at")
    return payload


@router.post("/match/search")
async def search_matches(body: MatchSearchRequest, tenant_id: str = Depends(get_tenant)) -> dict:
    competitor = await queries.get_competitor(tenant_id, body.competitor_id)
    if not competitor:
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    request = MatchRequest(body.product_name, competitor["id"], competitor["base_url"])
    candidates = await MatcherAgent().search(request)
    return {"candidates": [asdict(candidate) for candidate in candidates]}
