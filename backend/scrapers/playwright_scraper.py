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
    """Extract a price from an existing product page without opening another browser."""
    price = await _extract_jsonld_price(page)
    if price is None:
        price = await _extract_meta_price(page)
    if price is None:
        price = await _extract_css_price(page)
    return price


async def _extract_jsonld_price(page: Page) -> float | None:
    try:
        data = await page.evaluate(
            """() => {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            const readOffer = (offer) => {
              if (!offer) return null;
              const item = Array.isArray(offer) ? offer[0] : offer;
              return item?.price ?? item?.lowPrice ?? null;
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
    return _coerce_price(data)


async def _extract_meta_price(page: Page) -> float | None:
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
            return price
    return None


async def _extract_css_price(page: Page) -> float | None:
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
            return price
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
