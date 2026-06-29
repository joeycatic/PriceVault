"""Manual scrape, selector test, and product matching endpoints."""

import asyncio
import os
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, status

from agents.matcher_agent import MatchRequest, MatcherAgent
from agents.scraper_agent import ScrapeTarget, ScraperAgent
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
async def run_scrape(body: ScrapeRunRequest, tenant_id: str = Depends(get_tenant)) -> dict:
    if body.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Mandant stimmt nicht überein")
    rows = await queries.get_scrape_targets(tenant_id, body.competitor_product_ids)
    semaphore = asyncio.Semaphore(int(os.getenv("SCRAPE_CONCURRENCY", "3")))
    agent = ScraperAgent()

    async def scrape_one(row: dict):
        async with semaphore:
            return await agent.scrape(_target_from_row(row))

    results = await asyncio.gather(*(scrape_one(row) for row in rows))
    return {"triggered": len(results), "results": [asdict(result) for result in results]}


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

