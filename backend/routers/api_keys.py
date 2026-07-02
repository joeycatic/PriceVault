"""Tenant API-key management."""

import secrets
from uuid import uuid4

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status

from auth.plan_guard import require_plan_admin
from db import queries
from models.schemas import APIKeyCreate


router = APIRouter(prefix="/api-keys", tags=["api-keys"])


@router.get("")
async def list_all(tenant: dict = Depends(require_plan_admin("pro"))) -> list[dict]:
    return await queries.list_api_keys(tenant["id"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: APIKeyCreate, tenant: dict = Depends(require_plan_admin("pro"))) -> dict:
    raw = secrets.token_urlsafe(32)
    key_prefix = raw[:12]
    key_hash = bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()
    key = await queries.create_api_key(str(uuid4()), tenant["id"], body.name, key_prefix, key_hash)
    return {"id": key["id"], "key": f"pv_{raw}"}


@router.delete("/{key_id}")
async def revoke(
    key_id: str, tenant: dict = Depends(require_plan_admin("pro"))
) -> dict[str, bool]:
    if not await queries.revoke_api_key(tenant["id"], key_id):
        raise HTTPException(status_code=404, detail="API-Key nicht gefunden")
    return {"revoked": True}
