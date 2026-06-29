"""Stealth Playwright agent for competitor price snapshots."""

import asyncio
import json
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

from anthropic import AsyncAnthropic
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

from db import queries
from utils.logger import get_logger
from utils.price_parser import parse_price
from utils.stealth import close_stealth_page, get_stealth_page, navigate_stealth


logger = get_logger("scraper_agent")


@dataclass
class ScrapeTarget:
    competitor_product_id: str
    url: str
    selector_price: str | None
    selector_stock: str | None
    tenant_id: str
    competitor_id: str | None = None


@dataclass
class ScrapeResult:
    competitor_product_id: str
    price: float | None
    currency: str
    in_stock: bool | None
    raw_price_text: str | None
    scrape_ok: bool
    error_msg: str | None
    scraped_at: datetime


class ScraperAgent:
    """Extract a current price and optionally persist an append-only snapshot."""

    async def _extract_with_llm(self, page_text: str) -> dict[str, Any]:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required when no price selector is set")
        client = AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=150,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Given this product page text, extract the current price in EUR as a JSON "
                        "object: {\"price\": float, \"currency\": string, \"in_stock\": boolean}. "
                        "Return ONLY the JSON. Page text: " + page_text[:3000]
                    ),
                }
            ],
        )
        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.strip("`").removeprefix("json").strip()
        payload = json.loads(text)
        return {
            "price": float(payload["price"]),
            "currency": str(payload.get("currency", "EUR")),
            "in_stock": payload.get("in_stock"),
        }

    @staticmethod
    def _stock_from_text(value: str) -> bool:
        normalized = value.casefold()
        unavailable = ("nicht verfügbar", "ausverkauft", "nicht lieferbar", "out of stock")
        return not any(term in normalized for term in unavailable)

    async def _scrape_page(self, target: ScrapeTarget) -> ScrapeResult:
        page = None
        now = datetime.now(timezone.utc)
        try:
            async with async_playwright() as playwright:
                page = await get_stealth_page(playwright)
                await navigate_stealth(page, target.url)

                in_stock: bool | None = None
                if target.selector_stock:
                    stock_text = await page.locator(target.selector_stock).first.inner_text(timeout=10_000)
                    in_stock = self._stock_from_text(stock_text)

                if target.selector_price:
                    raw_price_text = await page.locator(target.selector_price).first.inner_text(timeout=15_000)
                    price = parse_price(raw_price_text)
                    currency = "EUR"
                else:
                    page_text = await page.locator("body").inner_text(timeout=15_000)
                    extracted = await self._extract_with_llm(page_text)
                    raw_price_text = None
                    price = extracted["price"]
                    currency = extracted["currency"]
                    if in_stock is None:
                        in_stock = extracted["in_stock"]

                return ScrapeResult(
                    competitor_product_id=target.competitor_product_id,
                    price=price,
                    currency=currency,
                    in_stock=in_stock,
                    raw_price_text=raw_price_text,
                    scrape_ok=True,
                    error_msg=None,
                    scraped_at=now,
                )
        except PlaywrightTimeoutError as exc:
            error = f"Timeout while loading or extracting the page: {exc}"
        except Exception as exc:  # A failed scrape must become a recorded result.
            error = f"{type(exc).__name__}: {exc}"
        finally:
            if page:
                await close_stealth_page(page)

        logger.error(
            "scrape_failed",
            extra={
                "agent": "scraper",
                "action": "scrape_failed",
                "tenant_id": target.tenant_id,
                "error": error,
            },
        )
        return ScrapeResult(
            competitor_product_id=target.competitor_product_id,
            price=None,
            currency="EUR",
            in_stock=None,
            raw_price_text=None,
            scrape_ok=False,
            error_msg=error[:1000],
            scraped_at=now,
        )

    async def scrape(self, target: ScrapeTarget, persist: bool = True) -> ScrapeResult:
        result = await self._scrape_page(target)
        if persist:
            snapshot = asdict(result)
            snapshot["tenant_id"] = target.tenant_id
            snapshot["scraped_at"] = result.scraped_at.isoformat()
            await queries.insert_snapshot(snapshot)
            if target.competitor_id:
                await queries.mark_competitor_scraped(target.competitor_id, result.scraped_at.isoformat())
        return result


async def _main() -> None:
    rows = await queries.get_scrape_targets()
    if not rows:
        print("No active scrape target found")
        return
    target = ScrapeTarget(**{key: rows[0][key] for key in ScrapeTarget.__dataclass_fields__})
    print(await ScraperAgent().scrape(target))


if __name__ == "__main__":
    asyncio.run(_main())

