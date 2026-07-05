"""Browserless-backed price extraction helpers."""

import re
from typing import Any

from playwright.async_api import Page, async_playwright

from scrapers.stealth import STEALTH_HEADERS, browserless_ws_url, random_user_agent
from utils.price_parser import parse_price


async def scrape_price(url: str) -> float:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.connect_over_cdp(browserless_ws_url())
        context = await browser.new_context(
            user_agent=random_user_agent(),
            extra_http_headers=STEALTH_HEADERS,
            locale="de-DE",
            timezone_id="Europe/Berlin",
            viewport={"width": 1366, "height": 768},
        )
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            price = await extract_price(page)
            if price is None:
                raise ValueError(f"No price found at {url}")
            return price
        finally:
            await browser.close()


async def extract_price(page: Page) -> float | None:
    """Compatibility wrapper for callers that only need the numeric value."""
    offer = await extract_offer(page)
    return float(offer["price"]) if offer else None


async def extract_offer(page: Page) -> dict[str, Any] | None:
    """Extract bounded commercial offer evidence without inventing a currency."""
    offer = await _extract_jsonld_offer(page)
    if offer:
        return offer
    offer = await _extract_meta_offer(page)
    if offer:
        return offer
    return await _extract_css_offer(page)


async def _extract_jsonld_offer(page: Page) -> dict[str, Any] | None:
    try:
        data = await page.evaluate(
            """() => {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            const readOffer = (offer) => {
              if (!offer) return null;
              const item = Array.isArray(offer) ? offer[0] : offer;
              const price = item?.price ?? item?.lowPrice ?? null;
              if (price == null) return null;
              return {
                price,
                currency: item?.priceCurrency ?? null,
                availability: item?.availability ?? null,
                raw: JSON.stringify({price, priceCurrency: item?.priceCurrency ?? null, availability: item?.availability ?? null}).slice(0, 500)
              };
            };
            for (const script of scripts) {
              try {
                const json = JSON.parse(script.textContent || 'null');
                const items = Array.isArray(json) ? json : [json];
                for (const item of items) {
                  const direct = readOffer(item?.offers);
                  if (direct) return direct;
                  for (const graphItem of item?.['@graph'] || []) {
                    const graphPrice = readOffer(graphItem?.offers);
                    if (graphPrice) return graphPrice;
                  }
                }
              } catch {}
            }
            return null;
            }"""
        )
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    price = _coerce_price(data.get("price"))
    if price is None:
        return None
    currency = _normalize_currency(data.get("currency"))
    availability = str(data.get("availability") or "").casefold()
    return {
        "price": price,
        "currency": currency,
        "in_stock": None if not availability else not any(term in availability for term in ("outofstock", "soldout", "discontinued")),
        "method": "json_ld",
        "confidence": 0.98 if currency else 0.78,
        "evidence": {"offer": str(data.get("raw") or "")[:500]},
    }


async def _extract_meta_offer(page: Page) -> dict[str, Any] | None:
    selectors = (
        'meta[property="product:price:amount"]',
        'meta[property="og:price:amount"]',
        'meta[itemprop="price"]',
    )
    for selector in selectors:
        try:
            content = await page.get_attribute(selector, "content")
        except Exception:
            continue
        price = _coerce_price(content)
        if price is not None:
            currency = None
            for currency_selector in ('meta[property="product:price:currency"]', 'meta[property="og:price:currency"]'):
                currency = _normalize_currency(await page.get_attribute(currency_selector, "content"))
                if currency:
                    break
            return {
                "price": price,
                "currency": currency,
                "in_stock": None,
                "method": "metadata",
                "confidence": 0.94 if currency else 0.76,
                "evidence": {"selector": selector, "value": str(content)[:160]},
            }
    return None


async def _extract_css_offer(page: Page) -> dict[str, Any] | None:
    selectors = (
        ".price--main",
        ".product-price",
        "[itemprop='price']",
        ".a-price-whole",
        ".price-box .price",
        "[data-testid*='price']",
    )
    for selector in selectors:
        try:
            text = await page.locator(selector).first.inner_text(timeout=3_000)
        except Exception:
            continue
        price = _coerce_price(text)
        if price is not None:
            currency = _currency_from_text(text)
            return {
                "price": price,
                "currency": currency,
                "in_stock": None,
                "method": "known_selector",
                "confidence": 0.86 if currency else 0.65,
                "evidence": {"selector": selector, "text": str(text)[:160]},
            }
    return None


def _coerce_price(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return parse_price(text)
    except ValueError:
        match = re.search(r"\d[\d.,]*", text)
        if not match:
            return None
        try:
            return parse_price(match.group(0))
        except ValueError:
            return None


def _normalize_currency(value: Any) -> str | None:
    if not value:
        return None
    normalized = str(value).strip().upper()
    aliases = {"€": "EUR", "$": "USD", "£": "GBP", "FR.": "CHF", "SFR": "CHF"}
    normalized = aliases.get(normalized, normalized)
    return normalized if re.fullmatch(r"[A-Z]{3}", normalized) else None


def _currency_from_text(value: str) -> str | None:
    normalized = value.upper()
    for marker, currency in (("EUR", "EUR"), ("€", "EUR"), ("CHF", "CHF"), ("USD", "USD"), ("$", "USD"), ("GBP", "GBP"), ("£", "GBP")):
        if marker in normalized:
            return currency
    return None
