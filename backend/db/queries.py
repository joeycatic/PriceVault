"""Named Supabase queries. Database access must stay in this module."""

import asyncio
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from db.client import get_supabase
from postgrest.types import ReturnMethod


async def _execute(build: Callable[[], Any]) -> list[dict[str, Any]]:
    response = await asyncio.to_thread(lambda: build().execute())
    return response.data or []


async def list_tenants() -> list[dict[str, Any]]:
    return await _execute(lambda: get_supabase().table("tenants").select("*"))


async def get_tenant_by_id(tenant_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("tenants").select("*").eq("id", tenant_id).limit(1)
    )
    return rows[0] if rows else None


async def update_tenant(tenant_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("tenants").update(values).eq("id", tenant_id)
    )
    return rows[0] if rows else None


async def create_billing_order(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("billing_orders").insert(values))
    return rows[0]


async def get_billing_order(order_code: int) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("billing_orders")
        .select("*")
        .eq("order_code", order_code)
        .limit(1)
    )
    return rows[0] if rows else None


async def update_billing_order(order_code: int, values: dict[str, Any]) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("billing_orders").update(values).eq("order_code", order_code)
    )
    return rows[0] if rows else None


async def list_due_viva_subscriptions(now: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("tenants")
        .select("id,subscription_plan,viva_initial_transaction_id,viva_source_code,subscription_current_period_end")
        .eq("billing_provider", "viva")
        .eq("subscription_status", "active")
        .lte("subscription_current_period_end", now)
    )


async def list_ended_viva_subscriptions(now: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("tenants")
        .select("id")
        .eq("billing_provider", "viva")
        .eq("subscription_status", "canceled")
        .lte("subscription_current_period_end", now)
    )


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


async def get_product(tenant_id: str, product_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("products")
        .select("id,active")
        .eq("tenant_id", tenant_id)
        .eq("id", product_id)
        .limit(1)
    )
    return rows[0] if rows else None


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


async def mark_competitor_scraped(
    tenant_id: str, competitor_id: str, scraped_at: str
) -> None:
    await _execute(
        lambda: get_supabase()
        .table("competitors")
        .update({"last_scraped_at": scraped_at})
        .eq("tenant_id", tenant_id)
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


async def count_snapshots_since(tenant_id: str, since_iso: str) -> int:
    response = await asyncio.to_thread(
        lambda: get_supabase()
        .table("price_snapshots")
        .select("id", count="exact", head=True)
        .eq("tenant_id", tenant_id)
        .gte("scraped_at", since_iso)
        .execute()
    )
    return int(response.count or 0)


async def count_active_products(tenant_id: str) -> int:
    response = await asyncio.to_thread(
        lambda: get_supabase()
        .table("products")
        .select("id", count="exact", head=True)
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .execute()
    )
    return int(response.count or 0)


async def list_alerts(tenant_id: str, active_only: bool = False) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("alerts").select("*").eq("tenant_id", tenant_id)
        if active_only:
            query = query.eq("active", True)
        return query.order("created_at", desc=True)

    return await _execute(build)


async def count_active_alerts(tenant_id: str) -> int:
    response = await asyncio.to_thread(
        lambda: get_supabase()
        .table("alerts")
        .select("id", count="exact", head=True)
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .execute()
    )
    return int(response.count or 0)


async def create_alert(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("alerts").insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def get_alert(tenant_id: str, alert_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("alerts")
        .select("id,active")
        .eq("tenant_id", tenant_id)
        .eq("id", alert_id)
        .limit(1)
    )
    return rows[0] if rows else None


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


async def insert_scrape_failure(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("scrape_failures").insert(values))
    return rows[0]


async def list_api_keys(tenant_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("api_keys")
        .select("id,name,created_at,last_used,revoked")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
    )


async def create_api_key(
    key_id: str, tenant_id: str, name: str, key_prefix: str, key_hash: str
) -> dict[str, Any]:
    await asyncio.to_thread(
        lambda: get_supabase().table("api_keys").insert(
            {
                "id": key_id,
                "tenant_id": tenant_id,
                "name": name,
                "key_prefix": key_prefix,
                "key_hash": key_hash,
            },
            returning=ReturnMethod.minimal,
        )
        .execute()
    )
    return {"id": key_id}


async def revoke_api_key(tenant_id: str, key_id: str) -> bool:
    rows = await _execute(
        lambda: get_supabase()
        .table("api_keys")
        .update({"revoked": True})
        .eq("tenant_id", tenant_id)
        .eq("id", key_id)
    )
    return bool(rows)


async def list_active_api_key_candidates(key_prefix: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("api_keys")
        .select("*")
        .eq("key_prefix", key_prefix)
        .eq("revoked", False)
    )


async def touch_api_key(key_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    await _execute(
        lambda: get_supabase()
        .table("api_keys")
        .update({"last_used": now})
        .eq("id", key_id)
    )


async def list_alert_channels(tenant_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("alert_channels")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
    )


async def get_alert_channel(tenant_id: str, channel_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("alert_channels")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", channel_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def create_alert_channel(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase()
        .table("alert_channels")
        .insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def update_alert_channel(
    tenant_id: str, channel_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("alert_channels")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", channel_id)
    )
    return rows[0] if rows else None


async def delete_alert_channel(tenant_id: str, channel_id: str) -> bool:
    rows = await _execute(
        lambda: get_supabase()
        .table("alert_channels")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", channel_id)
    )
    return bool(rows)


async def list_team_members(tenant_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("team_members")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("invited_at", desc=True)
    )


async def get_team_member(tenant_id: str, user_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("team_members")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("user_id", user_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def accept_team_membership(tenant_id: str, user_id: str) -> None:
    await _execute(
        lambda: get_supabase()
        .table("team_members")
        .update({"accepted": True})
        .eq("tenant_id", tenant_id)
        .eq("user_id", user_id)
    )


async def insert_team_member(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("team_members").insert(values))
    return rows[0]


async def delete_team_member(tenant_id: str, user_id: str) -> bool:
    rows = await _execute(
        lambda: get_supabase()
        .table("team_members")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("user_id", user_id)
    )
    return bool(rows)


async def create_connector_source(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase()
        .table("connector_sources")
        .insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def list_connector_sources(tenant_id: str) -> list[dict[str, Any]]:
    rows = await _execute(
        lambda: get_supabase()
        .table("connector_sources")
        .select("id,tenant_id,type,name,config,active,created_at")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
    )
    safe_rows = []
    for row in rows:
        config = row.get("config") or {}
        safe_config = {
            key: value
            for key, value in config.items()
            if key not in {"access_token", "access_token_ciphertext"}
        }
        safe_rows.append({**row, "config": safe_config})
    return safe_rows
