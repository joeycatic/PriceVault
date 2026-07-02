"""Shared transactional email configuration helpers."""

import os


def resend_sender() -> str:
    sender = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev").strip()
    if "<" in sender and ">" in sender:
        return sender
    return f"PriceVault <{sender}>"


def app_url(path: str = "") -> str:
    base_url = os.environ.get("APP_URL", "https://app.pricevault.de").rstrip("/")
    if not path:
        return base_url
    return f"{base_url}/{path.lstrip('/')}"
