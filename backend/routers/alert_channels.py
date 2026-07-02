"""Alert channel CRUD endpoints."""

from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Response, status

from auth.plan_guard import require_plan_admin
from db import queries
from models.schemas import AlertChannelCreate, AlertChannelUpdate
from security.crypto import decrypt_secret, encrypt_secret
from security.urls import validate_delivery_url


router = APIRouter(prefix="/alert-channels", tags=["alert-channels"])


def _public_channel(channel: dict) -> dict:
    channel_type = channel.get("type")
    key = "webhook_url" if channel_type == "slack" else "url"
    config = channel.get("config", {})
    value = config.get(key)
    if not isinstance(value, str):
        ciphertext = config.get(f"{key}_ciphertext")
        if isinstance(ciphertext, str):
            try:
                value = decrypt_secret(ciphertext)
            except Exception:
                value = None
    masked = "***"
    if isinstance(value, str):
        parsed = urlsplit(value)
        if parsed.scheme and parsed.netloc:
            masked = f"{parsed.scheme}://{parsed.netloc}/***"
    return {**channel, "config": {key: masked}}


def _config_key(channel_type: str) -> str:
    return "webhook_url" if channel_type == "slack" else "url"


def _validate_config(channel_type: str, config: dict) -> str:
    key = "webhook_url" if channel_type == "slack" else "url"
    value = config.get(key)
    if not isinstance(value, str) or not value:
        detail = "Slack-Webhook fehlt" if channel_type == "slack" else "Webhook-URL fehlt"
        raise HTTPException(status_code=400, detail=detail)
    try:
        validate_delivery_url(value, slack=channel_type == "slack")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return value


def _encrypted_config(channel_type: str, value: str) -> dict[str, str]:
    key = _config_key(channel_type)
    try:
        encrypted = encrypt_secret(value)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {f"{key}_ciphertext": encrypted}


@router.get("")
async def list_all(tenant: dict = Depends(require_plan_admin("pro"))) -> list[dict]:
    channels = await queries.list_alert_channels(tenant["id"])
    return [_public_channel(channel) for channel in channels]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(
    body: AlertChannelCreate, tenant: dict = Depends(require_plan_admin("pro"))
) -> dict:
    url = _validate_config(body.type, body.config)
    channel = await queries.create_alert_channel(
        tenant["id"],
        {
            "type": body.type,
            "config": _encrypted_config(body.type, url),
        },
    )
    return _public_channel(channel)


@router.patch("/{channel_id}")
async def update(
    channel_id: str, body: AlertChannelUpdate, tenant: dict = Depends(require_plan_admin("pro"))
) -> dict:
    values = body.model_dump(exclude_unset=True, mode="json")
    if body.config is not None:
        existing = await queries.get_alert_channel(tenant["id"], channel_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Kanal nicht gefunden")
        url = _validate_config(existing["type"], body.config)
        values["config"] = _encrypted_config(existing["type"], url)
    channel = await queries.update_alert_channel(
        tenant["id"], channel_id, values
    )
    if not channel:
        raise HTTPException(status_code=404, detail="Kanal nicht gefunden")
    return _public_channel(channel)


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(
    channel_id: str, tenant: dict = Depends(require_plan_admin("pro"))
) -> Response:
    if not await queries.delete_alert_channel(tenant["id"], channel_id):
        raise HTTPException(status_code=404, detail="Kanal nicht gefunden")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
