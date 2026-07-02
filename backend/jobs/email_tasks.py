"""Transactional email jobs."""

from pathlib import Path
import asyncio
import os

import resend

from emails.settings import app_url, resend_sender


TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "emails" / "templates"


async def send_email(ctx: dict, *, tenant_id: str, to: str, template: str) -> dict[str, str]:
    del ctx, tenant_id
    api_key = os.environ["RESEND_API_KEY"]
    resend.api_key = api_key
    template_path = TEMPLATE_DIR / f"{template}.html"
    html = template_path.read_text(encoding="utf-8").replace("{{APP_URL}}", app_url())
    subject = {
        "onboarding_day0": "Willkommen bei PriceVault",
        "onboarding_day3": "Dein erster Mitbewerber-Check",
        "onboarding_day7": "Mehr Preisbewegungen automatisch erkennen",
    }.get(template, "PriceVault")
    await asyncio.to_thread(
        resend.Emails.send,
        {
            "from": resend_sender(),
            "to": [to],
            "subject": subject,
            "html": html,
        },
    )
    return {"sent": to}
