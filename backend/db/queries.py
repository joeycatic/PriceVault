"""Named Supabase queries. Database access must stay in this module."""

import asyncio
from collections.abc import Callable
from typing import Any

from db.client import get_supabase


async def _execute(build: Callable[[], Any]) -> list[dict[str, Any]]:
    response = await asyncio.to_thread(lambda: build().execute())
    return response.data or []


async def list_tenants() -> list[dict[str, Any]]:
    return await _execute(lambda: get_supabase().table("tenants").select("*"))


async def list_competitors(tenant_id: str, active_only: bool = False) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("competitors").select("*").eq("tenant_id", tenant_id)
        if active_only:
            query = query.eq("active", True)
        return query.order("shop_name")

    return await _execute(build)


async def get_competitor(tenant_id: str, competitor_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("competitors")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", competitor_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def create_competitor(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("competitors").insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def update_competitor(
    tenant_id: str, competitor_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("competitors")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", competitor_id)
    )
    return rows[0] if rows else None


async def soft_delete_competitor(tenant_id: str, competitor_id: str) -> bool:
    updated = bool(await update_competitor(tenant_id, competitor_id, {"active": False}))
    if updated:
        await _execute(
            lambda: get_supabase()
            .table("competitor_products")
            .update({"active": False})
            .eq("tenant_id", tenant_id)
            .eq("competitor_id", competitor_id)
        )
    return updated


async def list_products(tenant_id: str, active_only: bool = False) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("products").select("*").eq("tenant_id", tenant_id)
        if active_only:
            query = query.eq("active", True)
        return query.order("name")

    return await _execute(build)


async def create_product(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("products").insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def update_product(
    tenant_id: str, product_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("products")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", product_id)
    )
    return rows[0] if rows else None


async def soft_delete_product(tenant_id: str, product_id: str) -> bool:
    updated = bool(await update_product(tenant_id, product_id, {"active": False}))
    if updated:
        await _execute(
            lambda: get_supabase()
            .table("competitor_products")
            .update({"active": False})
            .eq("tenant_id", tenant_id)
            .eq("product_id", product_id)
        )
    return updated


async def list_product_mappings(tenant_id: str, product_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("competitor_products")
        .select("*, competitors(shop_name, base_url)")
        .eq("tenant_id", tenant_id)
        .eq("product_id", product_id)
        .order("created_at")
    )


async def list_all_mappings(tenant_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("competitor_products")
        .select("*, products(name), competitors(shop_name)")
        .eq("tenant_id", tenant_id)
        .order("created_at")
    )


async def create_product_mapping(
    tenant_id: str, product_id: str, values: dict[str, Any]
) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("competitor_products").insert(
            {**values, "tenant_id": tenant_id, "product_id": product_id}
        )
    )
    return rows[0]


async def delete_product_mapping(tenant_id: str, mapping_id: str) -> bool:
    rows = await _execute(
        lambda: get_supabase()
        .table("competitor_products")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", mapping_id)
    )
    return bool(rows)


async def get_scrape_targets(
    tenant_id: str | None = None, competitor_product_ids: list[str] | None = None
) -> list[dict[str, Any]]:
    def build() -> Any:
        query = (
            get_supabase()
            .table("competitor_products")
            .select(
                "id,tenant_id,competitor_url,selector_price,competitor_id,"
                "competitors!inner(selector_price,selector_stock,active)"
            )
            .eq("active", True)
            .eq("competitors.active", True)
        )
        if tenant_id:
            query = query.eq("tenant_id", tenant_id)
        if competitor_product_ids:
            query = query.in_("id", competitor_product_ids)
        return query

    rows = await _execute(build)
    targets: list[dict[str, Any]] = []
    for row in rows:
        competitor = row.get("competitors") or {}
        targets.append(
            {
                "competitor_product_id": row["id"],
                "tenant_id": row["tenant_id"],
                "url": row["competitor_url"],
                "selector_price": row.get("selector_price") or competitor.get("selector_price"),
                "selector_stock": competitor.get("selector_stock"),
                "competitor_id": row["competitor_id"],
            }
        )
    return targets


async def insert_snapshot(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("price_snapshots").insert(values))
    return rows[0]


async def mark_competitor_scraped(competitor_id: str, scraped_at: str) -> None:
    await _execute(
        lambda: get_supabase()
        .table("competitors")
        .update({"last_scraped_at": scraped_at})
        .eq("id", competitor_id)
    )


async def get_latest_prices(tenant_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("v_latest_prices")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("delta_pct", desc=True)
    )


async def get_snapshot_history(
    tenant_id: str, competitor_product_id: str, since_iso: str
) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("price_snapshots")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("competitor_product_id", competitor_product_id)
        .gte("scraped_at", since_iso)
        .order("scraped_at")
    )


async def list_alerts(tenant_id: str, active_only: bool = False) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("alerts").select("*").eq("tenant_id", tenant_id)
        if active_only:
            query = query.eq("active", True)
        return query.order("created_at", desc=True)

    return await _execute(build)


async def create_alert(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("alerts").insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def update_alert(
    tenant_id: str, alert_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("alerts")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", alert_id)
    )
    return rows[0] if rows else None


async def delete_alert(tenant_id: str, alert_id: str) -> bool:
    rows = await _execute(
        lambda: get_supabase()
        .table("alerts")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", alert_id)
    )
    return bool(rows)


async def list_alert_events(tenant_id: str, limit: int) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("alert_events")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("triggered_at", desc=True)
        .limit(limit)
    )


async def insert_alert_event(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("alert_events").insert(values))
    return rows[0]
