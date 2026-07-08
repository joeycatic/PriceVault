"""Browserless Playwright page factory."""

import asyncio
import random
from typing import Literal

from playwright.async_api import Page, Playwright
from playwright_stealth import Stealth

from scrapers.stealth import STEALTH_HEADERS, browserless_ws_url


USER_AGENTS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
)
STEALTH = Stealth(navigator_languages_override=("de-DE", "de"))


async def get_stealth_page(playwright: Playwright) -> Page:
    """Create a German-localized Browserless page with stealth protections applied."""
    browser = await playwright.chromium.connect_over_cdp(browserless_ws_url())
    context = await browser.new_context(
        locale="de-DE",
        timezone_id="Europe/Berlin",
        viewport={"width": 1366, "height": 768},
        user_agent=random.choice(USER_AGENTS),
        extra_http_headers=STEALTH_HEADERS,
    )
    page = await context.new_page()
    await STEALTH.apply_stealth_async(page)
    return page


async def navigate_stealth(
    page: Page,
    url: str,
    *,
    wait_until: Literal["commit", "domcontentloaded", "load", "networkidle"] = "networkidle",
    timeout_ms: int = 45_000,
) -> None:
    """Apply a human-like pause before navigating to the requested readiness state."""
    await asyncio.sleep(random.uniform(1, 3))
    await page.goto(url, wait_until=wait_until, timeout=timeout_ms)


async def close_stealth_page(page: Page) -> None:
    """Close the page's browser and all associated contexts."""
    browser = page.context.browser
    if browser:
        await browser.close()
