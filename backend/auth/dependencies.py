"""Tenant dependencies shared by protected FastAPI routes."""

from fastapi import Depends, HTTPException, Request

from db import queries
from routers import get_tenant


async def get_current_tenant(
    request: Request, tenant_id: str = Depends(get_tenant)
) -> dict:
    tenant = await queries.get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Mandant nicht gefunden")
    user_id = getattr(request.state, "user_id", None)
    role = "owner"
    if user_id and tenant.get("user_id") != user_id:
        membership = await queries.get_team_member(tenant_id, user_id)
        if not membership:
            raise HTTPException(status_code=403, detail="Kein Zugriff auf diesen Mandanten")
        role = membership["role"]
        if membership.get("accepted") is False:
            await queries.accept_team_membership(tenant_id, user_id)
    return {
        **tenant,
        "_role": role,
        "_email": getattr(request.state, "user_email", None),
        "_actor_user_id": user_id,
    }
