"""Validation helpers for outbound integration destinations."""

from ipaddress import ip_address
from urllib.parse import urlparse


def normalize_shopify_domain(value: str) -> str:
    candidate = value.strip().lower()
    parsed = urlparse(candidate if "://" in candidate else f"https://{candidate}")
    hostname = parsed.hostname or ""
    if (
        parsed.username
        or parsed.password
        or parsed.port
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
        or not hostname.endswith(".myshopify.com")
        or hostname == "myshopify.com"
    ):
        raise ValueError("Shopify-Domain muss auf .myshopify.com enden")
    return hostname


def validate_delivery_url(value: str, *, slack: bool = False) -> str:
    parsed = urlparse(value)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"} or not hostname or parsed.username or parsed.password:
        raise ValueError("Ungültige Webhook-URL")
    if slack and (parsed.scheme != "https" or hostname != "hooks.slack.com"):
        raise ValueError("Slack-Webhooks müssen hooks.slack.com verwenden")
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")):
        raise ValueError("Lokale Webhook-Ziele sind nicht erlaubt")
    try:
        address = ip_address(hostname)
    except ValueError:
        pass
    else:
        if not address.is_global:
            raise ValueError("Private Webhook-Ziele sind nicht erlaubt")
    return value
