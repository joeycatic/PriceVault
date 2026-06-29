"""Stealth product URL discovery with fuzzy title ranking."""

import asyncio
from dataclasses import dataclass
from urllib.parse import quote_plus, urlparse

from playwright.async_api import Page, async_playwright
from rapidfuzz.fuzz import token_sort_ratio

from db import queries
from utils.stealth import close_stealth_page, get_stealth_page, navigate_stealth


@dataclass
class MatchRequest:
    product_name: str
    competitor_id: str
    competitor_base_url: str


@dataclass
class MatchCandidate:
    url: str
    title: str
    confidence: float


class MatcherAgent:
    """Find likely product pages without creating mappings."""

    async def _extract_links(self, page: Page, base_url: str) -> list[tuple[str, str]]:
        base_host = urlparse(base_url).netloc.removeprefix("www.")
        links: list[tuple[str, str]] = []
        anchors = page.locator("a[href]")
        for index in range(min(await anchors.count(), 150)):
            anchor = anchors.nth(index)
            href = await anchor.get_attribute("href")
            title = (await anchor.inner_text()).strip()
            if not href or not title:
                continue
            host = urlparse(href).netloc.removeprefix("www.")
            if host == base_host and href.startswith("http"):
                links.append((href.split("#", 1)[0], " ".join(title.split())))
        return links

    async def search(self, request: MatchRequest) -> list[MatchCandidate]:
        page = None
        links: list[tuple[str, str]] = []
        try:
            async with async_playwright() as playwright:
                page = await get_stealth_page(playwright)
                internal_url = (
                    request.competitor_base_url.rstrip("/")
                    + "/search?q="
                    + quote_plus(request.product_name)
                )
                try:
                    await navigate_stealth(page, internal_url)
                    links = await self._extract_links(page, request.competitor_base_url)
                except Exception:
                    links = []

                if not links:
                    query = quote_plus(
                        f"site:{request.competitor_base_url} {request.product_name}"
                    )
                    await navigate_stealth(page, f"https://www.google.com/search?q={query}")
                    links = await self._extract_links(page, request.competitor_base_url)
        finally:
            if page:
                await close_stealth_page(page)

        deduplicated: dict[str, str] = {}
        for url, title in links:
            deduplicated.setdefault(url, title)
        candidates = [
            MatchCandidate(
                url=url,
                title=title,
                confidence=round(token_sort_ratio(request.product_name, title) / 100, 3),
            )
            for url, title in deduplicated.items()
        ]
        return sorted(candidates, key=lambda candidate: candidate.confidence, reverse=True)[:5]


async def _main() -> None:
    tenants = await queries.list_tenants()
    if not tenants:
        print("No tenant found")
        return
    competitors = await queries.list_competitors(tenants[0]["id"], active_only=True)
    if not competitors:
        print("No active competitor found")
        return
    competitor = competitors[0]
    request = MatchRequest("Testprodukt", competitor["id"], competitor["base_url"])
    print(await MatcherAgent().search(request))


if __name__ == "__main__":
    asyncio.run(_main())

