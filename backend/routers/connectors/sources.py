"""Connector source management endpoints."""

from fastapi import APIRouter, Depends

from auth.plan_guard import require_plan_admin
from db import queries


router = APIRouter(prefix="/connectors", tags=["connectors"])


def _public_source(source: dict) -> dict:
    config = source.get("config") or {}
    safe_config = {
        key: value
        for key, value in config.items()
        if key not in {"access_token", "access_token_ciphertext"}
    }
    return {**source, "config": safe_config}


@router.get("")
async def list_sources(tenant: dict = Depends(require_plan_admin("pro"))) -> list[dict]:
    return [_public_source(source) for source in await queries.list_connector_sources(tenant["id"])]
