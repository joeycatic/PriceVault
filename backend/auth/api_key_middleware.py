"""X-API-Key validation helpers for external integrations."""

import bcrypt

from fastapi import Header, HTTPException

from auth.plan_guard import PLAN_RANK
from db import queries
from db.client import supabase_context


async def get_api_key_tenant(x_api_key: str = Header(..., alias="X-API-Key")) -> dict:
    if not x_api_key.startswith("pv_"):
        raise HTTPException(status_code=401, detail="Ungültiger API-Key")
    raw = x_api_key.removeprefix("pv_")
    if len(raw) < 32:
        raise HTTPException(status_code=401, detail="Ungültiger API-Key")
    key_prefix = raw[:12]
    with supabase_context(admin=True):
        key = None
        for candidate in await queries.list_active_api_key_candidates(key_prefix):
            if bcrypt.checkpw(raw.encode(), candidate["key_hash"].encode()):
                key = candidate
                break
        if not key:
            raise HTTPException(status_code=401, detail="Ungültiger API-Key")
        tenant = await queries.get_tenant_by_id(key["tenant_id"])
        if not tenant:
            raise HTTPException(status_code=401, detail="Mandant nicht gefunden")
        if PLAN_RANK.get(tenant.get("plan", "free"), 0) < PLAN_RANK["pro"]:
            raise HTTPException(status_code=403, detail="Plan 'pro' oder höher erforderlich")
        await queries.touch_api_key(key["id"])
    return tenant
