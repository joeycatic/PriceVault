"""Shared Browserless Playwright browser settings."""

import os

BROWSERLESS_HOST = os.environ.get(
    "BROWSERLESS_HOST", "wss://production-sfo.browserless.io"
)

STEALTH_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}

USER_AGENTS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
)


def browserless_ws_url() -> str:
    token = os.environ["BROWSERLESS_TOKEN"]
    separator = "&" if "?" in BROWSERLESS_HOST else "?"
    return f"{BROWSERLESS_HOST}{separator}token={token}"


def random_user_agent() -> str:
    contact = os.getenv("SCRAPER_CONTACT_URL", "https://pricevault.de/bot")
    return os.getenv("SCRAPER_USER_AGENT", f"PriceVaultBot/1.0 (+{contact})")
