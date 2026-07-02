"""Webhook route registrations."""

from fastapi import APIRouter, Request

from webhooks.viva_handler import handle_viva_webhook, viva_webhook_key


router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/viva")
async def verify_viva_webhook() -> dict:
    return await viva_webhook_key()


@router.post("/viva")
async def viva_webhook(request: Request) -> dict[str, bool]:
    return await handle_viva_webhook(request)
