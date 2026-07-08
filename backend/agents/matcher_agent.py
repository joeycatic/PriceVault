"""Stealth product URL discovery with fuzzy title ranking."""

import asyncio
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlparse

from playwright.async_api import Page, async_playwright
from rapidfuzz.fuzz import token_sort_ratio

from db import queries
from scrapers.public_catalog import search_public_shop
from utils.logger import get_logger
from utils.stealth import close_stealth_page, get_stealth_page, navigate_stealth


logger = get_logger("matcher_agent")


NON_PRODUCT_PATH_TOKENS = {
    "about",
    "account",
    "agb",
    "blog",
    "brands",
    "cart",
    "category",
    "categories",
    "checkout",
    "collection",
    "collections",
    "contact",
    "cookie",
    "cookies",
    "datenschutz",
    "faq",
    "impressum",
    "kategorie",
    "kategorien",
    "kontakt",
    "legal",
    "login",
    "logout",
    "marken",
    "newsletter",
    "payment",
    "privacy",
    "register",
    "registrieren",
    "retoure",
    "retouren",
    "returns",
    "rueckgabe",
    "search",
    "shipping",
    "sitemap",
    "suche",
    "terms",
    "ueber",
    "versand",
    "warenkorb",
    "widerruf",
    "wishlist",
}
MIN_FUZZY_CONFIDENCE = 0.55


@dataclass
class MatchRequest:
    product_name: str
    competitor_id: str
    competitor_base_url: str
    gtin: str | None = None


@dataclass
class MatchCandidate:
    url: str
    title: str
    confidence: float


class MatcherAgent:
    """Find likely product pages without creating mappings."""

    @staticmethod
    def _is_product_candidate_url(url: str) -> bool:
        path = unquote(urlparse(url).path).lower().translate(
            str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})
        )
        tokens = set(re.findall(r"[a-z0-9]+", path))
        return not tokens.intersection(NON_PRODUCT_PATH_TOKENS)

    async def _extract_links(self, page: Page, base_url: str) -> list[tuple[str, str]]:
        base_host = urlparse(base_url).netloc.removeprefix("www.")
        links: list[tuple[str, str]] = []
        anchors = page.locator("a[href]")
        raw_links = await anchors.evaluate_all(
            """elements => elements.slice(0, 150).map(element => ({
                href: element.getAttribute('href'),
                title: (element.textContent || '').trim(),
            }))"""
        )
        for item in raw_links:
            href = item.get("href")
            title = item.get("title", "")
            if not href or not title:
                continue
            parsed_href = urlparse(href)
            if parsed_href.path == "/url":
                href = parse_qs(parsed_href.query).get("q", [href])[0]
            absolute_url = urljoin(base_url, href)
            host = urlparse(absolute_url).netloc.removeprefix("www.")
            if host == base_host:
                links.append((absolute_url.split("#", 1)[0], " ".join(title.split())))
        return links

    async def search(self, request: MatchRequest) -> list[MatchCandidate]:
        query = request.gtin or request.product_name
        try:
            links = await asyncio.wait_for(
                search_public_shop(request.competitor_base_url, query),
                timeout=35,
            )
        except Exception as exc:
            logger.warning(
                "public_match_search_failed",
                action="public_match_search_failed",
                competitor_id=request.competitor_id,
                error_type=type(exc).__name__,
            )
            links = []

        public_candidates = self._rank(request, links)
        if public_candidates:
            return public_candidates

        page = None
        browser_links: list[tuple[str, str]] = []
        try:
            async with asyncio.timeout(35):
                async with async_playwright() as playwright:
                    page = await get_stealth_page(playwright)
                    internal_url = (
                        request.competitor_base_url.rstrip("/")
                        + "/search?q="
                        + quote_plus(query)
                    )
                    await navigate_stealth(
                        page,
                        internal_url,
                        wait_until="domcontentloaded",
                        timeout_ms=25_000,
                    )
                    await page.wait_for_timeout(1_000)
                    browser_links = await self._extract_links(page, request.competitor_base_url)
        except Exception as exc:
            logger.warning(
                "browser_match_search_failed",
                action="browser_match_search_failed",
                competitor_id=request.competitor_id,
                error_type=type(exc).__name__,
            )
        finally:
            if page:
                try:
                    await close_stealth_page(page)
                except Exception:
                    pass

        return self._rank(request, browser_links)

    def _rank(
        self, request: MatchRequest, links: list[tuple[str, str]]
    ) -> list[MatchCandidate]:
        deduplicated: dict[str, str] = {}
        for url, title in links:
            deduplicated.setdefault(url, title)
        candidates = []
        for url, title in deduplicated.items():
            if not self._is_product_candidate_url(url):
                continue
            exact_gtin = bool(request.gtin and request.gtin in f"{url} {title}")
            title_score = token_sort_ratio(request.product_name, title) / 100
            path_score = token_sort_ratio(
                request.product_name, urlparse(url).path.replace("-", " ")
            ) / 100
            confidence = 1.0 if exact_gtin else max(title_score, path_score)
            if confidence < MIN_FUZZY_CONFIDENCE:
                continue
            candidates.append(
                MatchCandidate(url=url, title=title, confidence=round(confidence, 3))
            )
        return sorted(candidates, key=lambda candidate: candidate.confidence, reverse=True)[:5]


async def _main() -> None:
    tenants = await queries.list_tenants()
    if not tenants:
        logger.info("no_tenant_found", action="no_tenant_found")
        return
    competitors = await queries.list_competitors(tenants[0]["id"], active_only=True)
    if not competitors:
        logger.info("no_active_competitor_found", action="no_active_competitor_found")
        return
    competitor = competitors[0]
    request = MatchRequest("Testprodukt", competitor["id"], competitor["base_url"])
    candidates = await MatcherAgent().search(request)
    logger.info(
        "matcher_agent_complete",
        action="matcher_agent_complete",
        candidates=[candidate.__dict__ for candidate in candidates],
    )


if __name__ == "__main__":
    asyncio.run(_main())
