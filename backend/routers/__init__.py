"""FastAPI routers and shared tenant header dependency."""

from fastapi import Header


async def get_tenant(x_tenant_id: str = Header(..., alias="X-Tenant-ID")) -> str:
    """Return the trusted dashboard tenant header for the Phase 1 MVP."""
    # TODO Phase 1.5: verify against Supabase JWT.
    return x_tenant_id

