"""Phase 2 GrowVault catalog synchronization scaffold."""

import asyncio


class SyncAgent:
    """
    Phase 2: Sync GrowVault product catalog into PriceVault.
    Calls GrowVault's internal /api/admin/products endpoint
    and upserts into public.products for the GrowVault tenant.
    TODO: implement after Phase 1 dashboard is live.
    """

    async def sync(self, tenant_id: str) -> dict:
        raise NotImplementedError("Phase 2 — not yet implemented")


if __name__ == "__main__":
    try:
        asyncio.run(SyncAgent().sync("phase-2-placeholder"))
    except NotImplementedError as exc:
        print(exc)

