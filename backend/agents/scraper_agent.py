"""Stealth Playwright agent for competitor price snapshots."""

import asyncio
import json
import os
import time
from contextlib import suppress
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from anthropic import AsyncAnthropic
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

from db import queries
from scrapers.playwright_scraper import extract_offer, extract_price
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
    expected_currency: str | None = None
    expected_variant: str | None = None
    source_validation_state: str = "unvalidated"
    approved_host: str | None = None


@dataclass
class ScrapeResult:
    competitor_product_id: str
    price: float | None
    currency: str | None
    in_stock: bool | None
    raw_price_text: str | None
    scrape_ok: bool
    error_msg: str | None
    scraped_at: datetime
    price_type: str = "unknown"
    vat_status: str = "unknown"
    shipping_status: str = "unknown"
    variant_evidence: str | None = None
    extraction_method: str = "unknown"
    confidence: float = 0
    source_evidence: dict[str, Any] | None = None
    validation_state: str = "unknown"
    validation_reason: str | None = None


@dataclass
class SelectorCandidate:
    selector: str
    raw_text: str
    price: float
    confidence: float


class ScraperAgent:
    """Extract a current price and optionally persist an append-only snapshot."""

    async def detect_price_selectors(self, url: str, tenant_id: str) -> list[SelectorCandidate]:
        page = None
        try:
            async with async_playwright() as playwright:
                page = await get_stealth_page(playwright)
                await navigate_stealth(page, url)
                candidates = await page.evaluate(
                    """() => {
                    const priceWords = /(preis|price|amount|betrag|sale|regular|current|product|offer)/i;
                    const priceText = /(€|eur|chf|\\$|£)\\s*\\d|\\d[\\d.,\\s]{1,12}\\s*(€|eur|chf|\\$|£)/i;
                    const escape = (value) => window.CSS?.escape ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
                    const directSelector = (element) => {
                      if (element.id) return `#${escape(element.id)}`;
                      const attrs = ["data-testid", "data-test", "data-cy", "data-price", "itemprop"];
                      for (const attr of attrs) {
                        const value = element.getAttribute(attr);
                        if (value) return `${element.tagName.toLowerCase()}[${attr}="${value.replace(/"/g, '\\"')}"]`;
                      }
                      const classes = [...element.classList].filter((name) => priceWords.test(name)).slice(0, 3);
                      if (classes.length) return `${element.tagName.toLowerCase()}.${classes.map(escape).join(".")}`;
                      const anyClasses = [...element.classList].slice(0, 2);
                      if (anyClasses.length) return `${element.tagName.toLowerCase()}.${anyClasses.map(escape).join(".")}`;
                      return null;
                    };
                    const pathSelector = (element) => {
                      const parts = [];
                      let current = element;
                      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
                        const direct = directSelector(current);
                        if (direct) {
                          parts.unshift(direct);
                          break;
                        }
                        const tag = current.tagName.toLowerCase();
                        const parent = current.parentElement;
                        if (!parent) break;
                        const siblings = [...parent.children].filter((child) => child.tagName === current.tagName);
                        const index = siblings.indexOf(current) + 1;
                        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
                        current = parent;
                      }
                      return parts.join(" > ");
                    };
                    const scoreElement = (element, selector, text) => {
                      let score = 0.35;
                      const joined = `${selector} ${element.className || ""} ${element.id || ""} ${[...element.attributes].map((attr) => `${attr.name}=${attr.value}`).join(" ")}`;
                      if (priceWords.test(joined)) score += 0.35;
                      if (/itemprop=["']?price/i.test(joined)) score += 0.2;
                      if (/€|eur/i.test(text)) score += 0.08;
                      if (text.length <= 28) score += 0.08;
                      return Math.min(score, 0.99);
                    };
                    const seen = new Set();
                    return [...document.querySelectorAll("body *")]
                      .filter((element) => {
                        const style = window.getComputedStyle(element);
                        if (style.display === "none" || style.visibility === "hidden") return false;
                        const rect = element.getBoundingClientRect();
                        if (rect.width < 8 || rect.height < 8) return false;
                        const text = (element.textContent || "").replace(/\\s+/g, " ").trim();
                        if (!text || text.length > 90 || !priceText.test(text)) return false;
                        const childText = [...element.children].map((child) => (child.textContent || "").replace(/\\s+/g, " ").trim()).join(" ");
                        return childText.length < text.length * 0.9;
                      })
                      .map((element) => {
                        const selector = directSelector(element) || pathSelector(element);
                        const text = (element.textContent || "").replace(/\\s+/g, " ").trim();
                        return { selector, raw_text: text, confidence: scoreElement(element, selector, text) };
                      })
                      .filter((item) => {
                        if (!item.selector || seen.has(item.selector)) return false;
                        seen.add(item.selector);
                        return true;
                      })
                      .sort((a, b) => b.confidence - a.confidence)
                      .slice(0, 12);
                    }"""
                )
        finally:
            if page:
                await close_stealth_page(page)

        parsed: list[SelectorCandidate] = []
        for candidate in candidates:
            try:
                price = parse_price(str(candidate["raw_text"]))
            except ValueError:
                continue
            parsed.append(
                SelectorCandidate(
                    selector=str(candidate["selector"]),
                    raw_text=str(candidate["raw_text"]),
                    price=price,
                    confidence=float(candidate.get("confidence") or 0),
                )
            )
        return parsed[:5]

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
                        "Given this product page text, extract the current advertised price without "
                        "assuming a currency. Return JSON: {\"price\": float, \"currency\": "
                        "string|null, \"in_stock\": boolean|null, \"price_type\": "
                        "\"regular\"|\"sale\"|\"member\"|\"unit\"|\"unknown\"}. "
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
            "currency": str(payload["currency"]).upper() if payload.get("currency") else None,
            "in_stock": payload.get("in_stock"),
            "price_type": payload.get("price_type", "unknown"),
            "method": "llm",
            "confidence": 0.6,
            "evidence": {
                "model": "claude-haiku-4-5",
                "input_tokens": int(getattr(message.usage, "input_tokens", 0)),
                "output_tokens": int(getattr(message.usage, "output_tokens", 0)),
            },
            "usage": {
                "input_tokens": int(getattr(message.usage, "input_tokens", 0)),
                "output_tokens": int(getattr(message.usage, "output_tokens", 0)),
            },
        }

    async def _extract_automatic(self, page) -> dict[str, Any]:
        legacy_price = await extract_price(page)
        if legacy_price is not None:
            return {
                "price": legacy_price,
                "currency": "EUR",
                "in_stock": None,
                "price_type": "regular",
                "method": "structured",
                "confidence": 0.9,
                "evidence": {"extractor": "legacy_price"},
            }
        offer = await extract_offer(page)
        if offer is not None:
            return offer
        if os.getenv("ANTHROPIC_API_KEY"):
            page_text = await page.locator("body").inner_text(timeout=15_000)
            return await self._extract_with_llm(page_text)
        raise ValueError("No price found in structured data, metadata, or known price selectors")

    @staticmethod
    def _currency_from_text(value: str) -> str | None:
        normalized = value.upper()
        for marker, currency in (("EUR", "EUR"), ("€", "EUR"), ("CHF", "CHF"), ("USD", "USD"), ("$", "USD"), ("GBP", "GBP"), ("£", "GBP")):
            if marker in normalized:
                return currency
        return None

    @staticmethod
    def _price_type_from_text(value: str) -> str:
        normalized = value.casefold()
        if any(term in normalized for term in ("mitglied", "member", "clubpreis")):
            return "member"
        if any(term in normalized for term in ("pro kg", "/kg", "je liter", "/l", "grundpreis")):
            return "unit"
        if any(term in normalized for term in ("sale", "angebot", "aktionspreis", "reduziert")):
            return "sale"
        return "regular"

    @staticmethod
    def _validate_offer(target: ScrapeTarget, offer: dict[str, Any]) -> tuple[str, str | None]:
        currency = offer.get("currency")
        confidence = float(offer.get("confidence") or 0)
        if not currency:
            return "ambiguous", "Währung konnte nicht sicher erkannt werden"
        if target.expected_currency and currency != target.expected_currency.upper():
            return "rejected", f"Erkannte Währung {currency} weicht von {target.expected_currency.upper()} ab"
        if offer.get("price_type") in {"member", "unit"}:
            return "ambiguous", "Mitglieds- oder Grundpreis ist kein belastbarer regulärer Verkaufspreis"
        if confidence < 0.8:
            return "ambiguous", "Extraktionskonfidenz liegt unter 0,80"
        return "valid", None

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
                final_host = (urlparse(page.url).hostname or "").lower().rstrip(".")
                expected_host = (target.approved_host or urlparse(target.url).hostname or "").lower().rstrip(".")
                if final_host != expected_host:
                    raise PermissionError("Weiterleitung auf einen nicht freigegebenen Host blockiert")

                in_stock: bool | None = None
                if target.selector_stock:
                    stock_text = await page.locator(target.selector_stock).first.inner_text(timeout=10_000)
                    in_stock = self._stock_from_text(stock_text)

                if target.selector_price:
                    raw_price_text = await page.locator(target.selector_price).first.inner_text(timeout=15_000)
                    price = parse_price(raw_price_text)
                    currency = self._currency_from_text(raw_price_text)
                    extracted = {
                        "price": price,
                        "currency": currency,
                        "in_stock": in_stock,
                        "price_type": self._price_type_from_text(raw_price_text),
                        "method": "selector",
                        "confidence": 0.92 if currency else 0.72,
                        "evidence": {"selector": target.selector_price, "text": raw_price_text[:160]},
                    }
                else:
                    extracted = await self._extract_automatic(page)
                    raw_price_text = None
                    price = extracted["price"]
                    currency = extracted["currency"]
                    if in_stock is None:
                        in_stock = extracted["in_stock"]

                extracted.setdefault("price_type", "unknown")
                validation_state, validation_reason = self._validate_offer(target, extracted)

                return ScrapeResult(
                    competitor_product_id=target.competitor_product_id,
                    price=price,
                    currency=currency,
                    in_stock=in_stock,
                    raw_price_text=raw_price_text,
                    scrape_ok=True,
                    error_msg=None,
                    scraped_at=now,
                    price_type=extracted["price_type"],
                    variant_evidence=target.expected_variant,
                    extraction_method=extracted.get("method", "unknown"),
                    confidence=float(extracted.get("confidence") or 0),
                    source_evidence=extracted.get("evidence") or {},
                    validation_state=validation_state,
                    validation_reason=validation_reason,
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
            action="scrape_failed",
            tenant_id=target.tenant_id,
            error=error,
        )
        return ScrapeResult(
            competitor_product_id=target.competitor_product_id,
            price=None,
            currency=None,
            in_stock=None,
            raw_price_text=None,
            scrape_ok=False,
            error_msg=error[:1000],
            scraped_at=now,
            source_evidence={},
        )

    async def scrape(self, target: ScrapeTarget, persist: bool = True) -> ScrapeResult:
        started = time.perf_counter()
        result = await self._scrape_page(target)
        if persist:
            snapshot = asdict(result)
            snapshot["tenant_id"] = target.tenant_id
            snapshot["scraped_at"] = result.scraped_at.isoformat()
            await queries.insert_snapshot(snapshot)
            with suppress(Exception):
                await queries.insert_usage_event(target.tenant_id, "stored_snapshots")
                await queries.insert_usage_event(
                    target.tenant_id, "browser_seconds", time.perf_counter() - started
                )
                if result.extraction_method == "llm":
                    await queries.insert_usage_event(target.tenant_id, "llm_calls")
                    await queries.insert_usage_event(
                        target.tenant_id,
                        "llm_input_tokens",
                        float((result.source_evidence or {}).get("input_tokens", 0)),
                    )
                    await queries.insert_usage_event(
                        target.tenant_id,
                        "llm_output_tokens",
                        float((result.source_evidence or {}).get("output_tokens", 0)),
                    )
            if target.competitor_id:
                await queries.mark_competitor_scraped(
                    target.tenant_id,
                    target.competitor_id,
                    result.scraped_at.isoformat(),
                )
        return result


async def _main() -> None:
    rows = await queries.get_scrape_targets()
    if not rows:
        logger.info("no_active_scrape_target_found", action="no_active_scrape_target_found")
        return
    target = ScrapeTarget(**{key: rows[0][key] for key in ScrapeTarget.__dataclass_fields__})
    result = await ScraperAgent().scrape(target)
    logger.info("scraper_agent_complete", action="scraper_agent_complete", result=asdict(result))


if __name__ == "__main__":
    asyncio.run(_main())
