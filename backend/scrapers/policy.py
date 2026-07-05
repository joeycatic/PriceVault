"""Conservative robots and approved-host policy checks for price sources."""

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx


@dataclass(frozen=True)
class SourcePolicyDecision:
    allowed: bool
    robots_result: str
    approved_host: str
    crawl_delay_seconds: float
    block_reason: str | None
    checked_at: datetime


def scraper_user_agent() -> str:
    contact = os.getenv("SCRAPER_CONTACT_URL", "https://pricevault.de/bot")
    return f"PriceVaultBot/1.0 (+{contact})"


def approved_host(url: str) -> str:
    host = (urlparse(url).hostname or "").lower().rstrip(".")
    if not host:
        raise ValueError("Preisquelle hat keinen gültigen Host")
    return host


def same_approved_host(url: str, expected_host: str) -> bool:
    return approved_host(url) == expected_host.lower().rstrip(".")


def policy_check_due(policy: dict | None, *, now: datetime | None = None) -> bool:
    if not policy or not policy.get("robots_checked_at"):
        return True
    checked = datetime.fromisoformat(str(policy["robots_checked_at"]).replace("Z", "+00:00"))
    return checked + timedelta(hours=24) <= (now or datetime.now(timezone.utc))


async def evaluate_source_policy(url: str) -> SourcePolicyDecision:
    now = datetime.now(timezone.utc)
    host = approved_host(url)
    robots_url = urljoin(f"{urlparse(url).scheme}://{host}", "/robots.txt")
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=15) as client:
            response = await client.get(robots_url, headers={"User-Agent": scraper_user_agent()})
        if response.is_redirect:
            location = response.headers.get("location", "")
            redirected = urljoin(robots_url, location)
            if not same_approved_host(redirected, host):
                return SourcePolicyDecision(False, "disallowed", host, 2, "robots.txt leitet auf einen nicht freigegebenen Host um", now)
        if response.status_code in {401, 403}:
            return SourcePolicyDecision(False, "disallowed", host, 2, "robots.txt verweigert den Zugriff", now)
        if response.status_code >= 500:
            return SourcePolicyDecision(False, "unavailable", host, 2, "robots.txt ist vorübergehend nicht prüfbar", now)
        if response.status_code == 404:
            return SourcePolicyDecision(True, "allowed", host, 2, None, now)
        response.raise_for_status()
    except httpx.HTTPError:
        return SourcePolicyDecision(False, "unavailable", host, 2, "robots.txt ist vorübergehend nicht prüfbar", now)

    parser = RobotFileParser()
    parser.set_url(robots_url)
    parser.parse(response.text.splitlines())
    user_agent = scraper_user_agent()
    allowed = parser.can_fetch(user_agent, url)
    crawl_delay = parser.crawl_delay(user_agent) or parser.crawl_delay("*") or 2
    crawl_delay = min(3600, max(0.5, float(crawl_delay)))
    return SourcePolicyDecision(
        allowed,
        "allowed" if allowed else "disallowed",
        host,
        crawl_delay,
        None if allowed else "robots.txt untersagt den Abruf dieser URL",
        now,
    )
