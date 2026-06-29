"""Stealth-enabled Playwright browser factory."""

import asyncio
import random

from playwright.async_api import Page, Playwright
from playwright_stealth import stealth_async


USER_AGENTS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
)


async def get_stealth_page(playwright: Playwright) -> Page:
    """Create a German-localized Chromium page with stealth protections applied."""
    browser = await playwright.chromium.launch(headless=True, slow_mo=50)
    context = await browser.new_context(
        locale="de-DE",
        timezone_id="Europe/Berlin",
        viewport={"width": 1366, "height": 768},
        user_agent=random.choice(USER_AGENTS),
    )
    page = await context.new_page()
    await stealth_async(page)
    return page


async def navigate_stealth(page: Page, url: str) -> None:
    """Apply a human-like pause before a network-idle navigation."""
    await asyncio.sleep(random.uniform(1, 3))
    await page.goto(url, wait_until="networkidle", timeout=45_000)


async def close_stealth_page(page: Page) -> None:
    """Close the page's browser and all associated contexts."""
    browser = page.context.browser
    if browser:
        await browser.close()

