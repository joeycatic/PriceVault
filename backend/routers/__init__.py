"""FastAPI routers and shared tenant dependency."""

import asyncio
from collections.abc import AsyncIterator

from fastapi import Header, HTTPException, Request, status

from db.client import get_supabase, supabase_context


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Supabase Bearer Token fehlt",
        )
    return authorization.removeprefix("Bearer ").strip()


async def get_tenant(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
) -> AsyncIterator[str]:
    """Validate that the Supabase user token owns the requested tenant."""
    token = _bearer_token(authorization)
    with supabase_context(access_token=token):
        user_response = await asyncio.to_thread(lambda: get_supabase().auth.get_user(token))
        user = getattr(user_response, "user", None)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Supabase Sitzung ist ungültig",
            )
        rows = await asyncio.to_thread(
            lambda: get_supabase()
            .table("tenants")
            .select("id")
            .eq("id", x_tenant_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Mandant stimmt nicht mit der Sitzung überein",
            )
        request.state.user_id = user.id
        request.state.user_email = getattr(user, "email", None)
        request.state.tenant_id = x_tenant_id
        yield x_tenant_id
