"""Named Supabase queries. Database access must stay in this module."""

import asyncio
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from db.client import get_supabase
from postgrest.types import ReturnMethod


async def _execute(build: Callable[[], Any]) -> list[dict[str, Any]]:
    response = await asyncio.to_thread(lambda: build().execute())
    return response.data or []


async def _execute_scalar(build: Callable[[], Any]) -> Any:
    response = await asyncio.to_thread(lambda: build().execute())
    return response.data


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


async def create_billing_invoice(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("billing_invoices").insert(values))
    return rows[0]


async def next_billing_invoice_number() -> str:
    value = await _execute_scalar(lambda: get_supabase().rpc("next_billing_invoice_number"))
    if not value:
        raise RuntimeError("Rechnungsnummer konnte nicht reserviert werden")
    if isinstance(value, list):
        value = value[0]
    return str(value if not isinstance(value, dict) else next(iter(value.values())))


async def create_billing_adjustment(values: dict[str, Any]) -> dict[str, Any]:
    kind = values["type"]
    number_value = await _execute_scalar(
        lambda: get_supabase().rpc("next_billing_adjustment_number", {"kind": kind})
    )
    if not number_value:
        raise RuntimeError("Belegnummer konnte nicht reserviert werden")
    if isinstance(number_value, list):
        number_value = number_value[0]
    number = str(number_value if not isinstance(number_value, dict) else next(iter(number_value.values())))
    payload = {**values, "adjustment_number": number}
    if values.get("provider_transaction_id"):
        rows = await _execute(
            lambda: get_supabase().table("billing_adjustments").upsert(
                payload, on_conflict="provider_transaction_id,type", ignore_duplicates=True
            )
        )
        if rows:
            return rows[0]
        existing = await _execute(
            lambda: get_supabase().table("billing_adjustments").select("*").eq("provider_transaction_id", values["provider_transaction_id"]).eq("type", values["type"]).limit(1)
        )
        if existing:
            return existing[0]
    rows = await _execute(lambda: get_supabase().table("billing_adjustments").insert(payload))
    return rows[0]


async def list_billing_adjustments(tenant_reference: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("billing_adjustments")
        .select("*")
        .eq("tenant_reference", tenant_reference)
        .order("created_at", desc=True)
    )


async def get_billing_adjustment(tenant_reference: str, adjustment_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("billing_adjustments").select("*,billing_invoices(*)").eq("tenant_reference", tenant_reference).eq("id", adjustment_id).limit(1)
    )
    return rows[0] if rows else None


async def create_billing_refund_request(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("billing_refund_requests").insert(values))
    return rows[0]


async def list_billing_refund_requests(tenant_id: str | None = None) -> list[dict[str, Any]]:
    def build():
        query = get_supabase().table("billing_refund_requests").select("*,billing_invoices(invoice_number,gross_amount_cents,currency)")
        if tenant_id:
            query = query.eq("tenant_id", tenant_id)
        return query.order("requested_at", desc=True)
    return await _execute(build)


async def get_billing_refund_request(request_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("billing_refund_requests").select("*,billing_invoices(*)").eq("id", request_id).limit(1)
    )
    return rows[0] if rows else None


async def get_billing_refund_request_by_provider_transaction(transaction_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("billing_refund_requests").select("*,billing_invoices(*)").eq("provider_transaction_id", transaction_id).limit(1)
    )
    return rows[0] if rows else None


async def update_billing_refund_request(request_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("billing_refund_requests").update(values).eq("id", request_id)
    )
    return rows[0] if rows else None


async def refundable_amount_cents(tenant_id: str, invoice_id: str) -> int:
    invoice = await get_billing_invoice(tenant_id, invoice_id)
    if not invoice:
        return -1
    adjustments = await _execute(
        lambda: get_supabase().table("billing_adjustments").select("amount_cents").eq("tenant_reference", tenant_id).eq("invoice_id", invoice_id).eq("type", "refund")
    )
    pending = await _execute(
        lambda: get_supabase().table("billing_refund_requests").select("amount_cents,status").eq("tenant_id", tenant_id).eq("invoice_id", invoice_id).in_("status", ["requested", "approved", "processing", "succeeded"])
    )
    committed = sum(int(row["amount_cents"]) for row in adjustments)
    reserved = sum(int(row["amount_cents"]) for row in pending if row.get("status") != "succeeded")
    return max(0, int(invoice["gross_amount_cents"]) - committed - reserved)


async def list_paid_billing_orders_since(since_iso: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("billing_orders")
        .select("*")
        .eq("status", "paid")
        .gte("paid_at", since_iso)
    )


async def upsert_billing_reconciliation(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase()
        .table("billing_reconciliations")
        .upsert(values, on_conflict="reconciliation_date")
    )
    return rows[0]


async def list_billing_invoices(tenant_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("billing_invoices")
        .select("*")
        .eq("tenant_reference", tenant_id)
        .order("issued_at", desc=True)
    )


async def get_billing_invoice(tenant_id: str, invoice_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("billing_invoices")
        .select("*")
        .eq("tenant_reference", tenant_id)
        .eq("id", invoice_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def update_billing_invoice_state(
    tenant_id: str, invoice_id: str, invoice_state: str
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("billing_invoices")
        .update({"invoice_state": invoice_state})
        .eq("tenant_reference", tenant_id)
        .eq("id", invoice_id)
    )
    return rows[0] if rows else None


async def get_billing_invoice_by_transaction(
    tenant_id: str, transaction_id: str
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("billing_invoices")
        .select("*")
        .eq("tenant_reference", tenant_id)
        .eq("transaction_id", transaction_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def get_billing_order_for_invoice(invoice_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("billing_invoices").select("billing_orders(order_code)").eq("id", invoice_id).limit(1)
    )
    if not rows:
        return None
    return rows[0].get("billing_orders")


async def list_due_viva_subscriptions(now: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("tenants")
        .select(
            "id,subscription_plan,viva_initial_transaction_id,viva_source_code,"
            "subscription_current_period_end,failed_payment_count"
        )
        .eq("billing_provider", "viva")
        .eq("subscription_status", "active")
        .eq("subscription_cancel_at_period_end", False)
        .lte("subscription_current_period_end", now)
    )


async def list_ended_viva_subscriptions(now: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("tenants")
        .select("id")
        .eq("billing_provider", "viva")
        .or_(
            "subscription_status.eq.canceled,"
            "subscription_cancel_at_period_end.eq.true,"
            "subscription_status.eq.past_due"
        )
        .lte("subscription_current_period_end", now)
    )


async def list_competitors(tenant_id: str, active_only: bool = False) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("competitors").select("*").eq("tenant_id", tenant_id)
        if active_only:
            query = query.eq("active", True)
        return query.order("shop_name")

    return await _execute(build)


async def count_active_competitors(tenant_id: str) -> int:
    response = await asyncio.to_thread(
        lambda: get_supabase()
        .table("competitors")
        .select("id", count="exact", head=True)
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .execute()
    )
    return int(response.count or 0)


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
        .select("*")
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


async def list_product_variants(
    tenant_id: str, product_id: str | None = None, active_only: bool = False
) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("product_variants").select("*").eq("tenant_id", tenant_id)
        if product_id:
            query = query.eq("product_id", product_id)
        if active_only:
            query = query.eq("active", True)
        return query.order("is_default", desc=True).order("name")

    return await _execute(build)


async def get_product_variant(
    tenant_id: str, variant_id: str
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("product_variants")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", variant_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def create_product_variant(
    tenant_id: str, product_id: str, values: dict[str, Any]
) -> dict[str, Any]:
    if values.get("is_default"):
        await _execute(
            lambda: get_supabase()
            .table("product_variants")
            .update({"is_default": False})
            .eq("tenant_id", tenant_id)
            .eq("product_id", product_id)
        )
    rows = await _execute(
        lambda: get_supabase().table("product_variants").insert(
            {**values, "tenant_id": tenant_id, "product_id": product_id}
        )
    )
    return rows[0]


async def update_product_variant(
    tenant_id: str, variant_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    current = await get_product_variant(tenant_id, variant_id)
    if not current:
        return None
    if values.get("is_default"):
        await _execute(
            lambda: get_supabase()
            .table("product_variants")
            .update({"is_default": False})
            .eq("tenant_id", tenant_id)
            .eq("product_id", current["product_id"])
        )
    rows = await _execute(
        lambda: get_supabase()
        .table("product_variants")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", variant_id)
    )
    return rows[0] if rows else None


async def list_product_mappings(tenant_id: str, product_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("competitor_products")
        .select("*, product_variants(name,sku,gtin,our_price,currency), competitors(shop_name, base_url)")
        .eq("tenant_id", tenant_id)
        .eq("product_id", product_id)
        .order("created_at")
    )


async def list_all_mappings(tenant_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("competitor_products")
        .select("*, products(name), product_variants(name,sku,gtin,our_price,currency), competitors(shop_name)")
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


async def get_mapping_for_variant_competitor(
    tenant_id: str, variant_id: str, competitor_id: str
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("competitor_products")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("variant_id", variant_id)
        .eq("competitor_id", competitor_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def create_match_suggestions(values: list[dict[str, Any]]) -> None:
    if not values:
        return
    await _execute(
        lambda: get_supabase()
        .table("match_suggestions")
        .upsert(
            values,
            on_conflict="variant_id,competitor_id,candidate_url",
            ignore_duplicates=True,
        )
    )


async def list_match_suggestions(
    tenant_id: str,
    status: str = "pending",
    variant_id: str | None = None,
    competitor_id: str | None = None,
) -> list[dict[str, Any]]:
    def build() -> Any:
        query = (
            get_supabase()
            .table("match_suggestions")
            .select(
                "*, products(name), product_variants(name,sku,gtin), competitors(shop_name)"
            )
            .eq("tenant_id", tenant_id)
            .eq("status", status)
        )
        if variant_id:
            query = query.eq("variant_id", variant_id)
        if competitor_id:
            query = query.eq("competitor_id", competitor_id)
        return query.order("confidence", desc=True).order("created_at", desc=True)

    return await _execute(build)


async def get_match_suggestion(tenant_id: str, suggestion_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("match_suggestions")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", suggestion_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def update_match_suggestion(
    tenant_id: str, suggestion_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("match_suggestions")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", suggestion_id)
    )
    return rows[0] if rows else None


async def list_repricing_rules(tenant_id: str, active_only: bool = False) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("repricing_rules").select("*").eq("tenant_id", tenant_id)
        if active_only:
            query = query.eq("active", True)
        return query.order("created_at", desc=True)

    return await _execute(build)


async def create_repricing_rule(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("repricing_rules").insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def update_repricing_rule(
    tenant_id: str, rule_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("repricing_rules")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", rule_id)
    )
    return rows[0] if rows else None


async def list_reprice_suggestions(
    tenant_id: str, suggestion_status: str = "pending"
) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("reprice_suggestions")
        .select("*, repricing_rules(name,strategy,beat_by_pct,min_margin_pct,approval_mode,max_change_pct,require_healthy_sources), products(name), product_variants(name,sku,cost_price,currency)")
        .eq("tenant_id", tenant_id)
        .eq("status", suggestion_status)
        .order("created_at", desc=True)
    )


async def get_reprice_suggestion(tenant_id: str, suggestion_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("reprice_suggestions")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", suggestion_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def upsert_pending_reprice_suggestion(
    tenant_id: str, variant_id: str, values: dict[str, Any]
) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase()
        .table("reprice_suggestions")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("variant_id", variant_id)
        .eq("status", "pending")
        .limit(1)
    )
    if rows:
        updated = await _execute(
            lambda: get_supabase()
            .table("reprice_suggestions")
            .update(values)
            .eq("tenant_id", tenant_id)
            .eq("id", rows[0]["id"])
        )
        return updated[0]
    created = await _execute(
        lambda: get_supabase()
        .table("reprice_suggestions")
        .insert({**values, "tenant_id": tenant_id, "variant_id": variant_id})
    )
    return created[0]


async def update_reprice_suggestion(
    tenant_id: str, suggestion_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("reprice_suggestions")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", suggestion_id)
    )
    return rows[0] if rows else None


async def get_product_mapping(tenant_id: str, mapping_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("competitor_products")
        .select("*, products(name), product_variants(name,sku,gtin,our_price,currency), competitors(shop_name,selector_stock)")
        .eq("tenant_id", tenant_id)
        .eq("id", mapping_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def update_product_mapping(
    tenant_id: str, mapping_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("competitor_products")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", mapping_id)
    )
    return rows[0] if rows else None


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
                "expected_currency,expected_variant,validation_state,"
                "health_status,consecutive_failures,last_successful_scrape_at,"
                "competitors!inner(selector_price,selector_stock,active,scrape_freq_h,last_scraped_at)"
            )
            .eq("active", True)
            .eq("competitors.active", True)
        )
        if tenant_id:
            query = query.eq("tenant_id", tenant_id)
        if competitor_product_ids:
            query = query.in_("id", competitor_product_ids)
        else:
            query = query.in_("health_status", ["healthy", "degraded"])
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
                "expected_currency": row.get("expected_currency"),
                "expected_variant": row.get("expected_variant"),
                "source_validation_state": row.get("validation_state") or "unvalidated",
                "health_status": row.get("health_status"),
                "consecutive_failures": row.get("consecutive_failures"),
                "scrape_freq_h": competitor.get("scrape_freq_h"),
                "last_scraped_at": row.get("last_successful_scrape_at"),
            }
        )
    return targets


async def get_due_scrape_targets(tenant_id: str | None = None) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    rows = await get_scrape_targets(tenant_id)
    due: list[dict[str, Any]] = []
    for row in rows:
        last_scraped_at = row.get("last_scraped_at")
        if not last_scraped_at:
            due.append(row)
            continue
        try:
            parsed = datetime.fromisoformat(str(last_scraped_at).replace("Z", "+00:00"))
        except ValueError:
            due.append(row)
            continue
        frequency = int(row.get("scrape_freq_h") or 12)
        if parsed + timedelta(hours=frequency) <= now:
            due.append(row)
    return due


async def insert_snapshot(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("price_snapshots").insert(values))
    return rows[0]


async def get_source_policy(
    tenant_id: str, competitor_product_id: str
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("source_policies")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("competitor_product_id", competitor_product_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def get_latest_source_snapshot(tenant_id: str, competitor_product_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("price_snapshots").select("currency,price_type,vat_status,shipping_status,variant_evidence,extraction_method,confidence,source_evidence,validation_state,validation_reason,scraped_at,scrape_ok,error_msg").eq("tenant_id", tenant_id).eq("competitor_product_id", competitor_product_id).order("scraped_at", desc=True).limit(1)
    )
    return rows[0] if rows else None


async def upsert_source_policy(
    tenant_id: str, competitor_product_id: str, values: dict[str, Any]
) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase()
        .table("source_policies")
        .upsert(
            {
                **values,
                "tenant_id": tenant_id,
                "competitor_product_id": competitor_product_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="tenant_id,competitor_product_id",
        )
    )
    return rows[0]


async def insert_usage_event(tenant_id: str, metric: str, quantity: float = 1) -> None:
    await _execute(
        lambda: get_supabase().table("usage_events").insert(
            {"tenant_id": tenant_id, "metric": metric, "quantity": quantity}
        )
    )


async def tenant_usage_summary(tenant_id: str, since_iso: str) -> dict[str, int]:
    async def count(table: str, *, active: bool = False) -> int:
        def build():
            query = get_supabase().table(table).select("id", count="exact", head=True).eq("tenant_id", tenant_id)
            return query.eq("active", True) if active else query
        response = await asyncio.to_thread(lambda: build().execute())
        return int(response.count or 0)

    products, competitors, scrapes, reports, snapshots = await asyncio.gather(
        count("products", active=True), count("competitors", active=True),
        count("price_snapshots"), count("report_runs"), count("price_snapshots"),
    )
    usage = await _execute(
        lambda: get_supabase().table("usage_events").select("metric,quantity").eq("tenant_id", tenant_id).gte("occurred_at", since_iso)
    )
    totals = {"emails": 0, "report_generations": reports, "stored_snapshots": snapshots}
    for event in usage:
        if event["metric"] in totals:
            totals[event["metric"]] += round(float(event["quantity"]))
    return {"products": products, "competitors": competitors, "scrapes": scrapes, **totals}


async def record_product_event(
    tenant_id: str, event_name: str, plan: str | None, dedupe_key: str = "once"
) -> None:
    await _execute(
        lambda: get_supabase().table("product_events").upsert(
            {"tenant_id": tenant_id, "event_name": event_name, "plan": plan, "dedupe_key": dedupe_key},
            on_conflict="tenant_id,event_name,dedupe_key", ignore_duplicates=True,
        )
    )


async def list_usage_events_since(since_iso: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase().table("usage_events").select("*").gte("occurred_at", since_iso)
    )


async def list_internal_cost_rates() -> list[dict[str, Any]]:
    return await _execute(lambda: get_supabase().table("internal_cost_rates").select("*"))


async def upsert_tenant_cost_summary(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("tenant_cost_summaries").upsert(
            values, on_conflict="tenant_id,summary_date"
        )
    )
    return rows[0]


async def list_tenant_cost_summaries(since_date: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase().table("tenant_cost_summaries").select("*").gte("summary_date", since_date)
    )


async def list_product_events_since(since_iso: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase().table("product_events").select("*").gte("occurred_at", since_iso)
    )


async def list_billing_reconciliations(limit: int = 30) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase().table("billing_reconciliations").select("*").order("reconciliation_date", desc=True).limit(limit)
    )


async def count_automatic_repricing_changes_since(tenant_id: str, since_iso: str) -> int:
    response = await asyncio.to_thread(
        lambda: get_supabase()
        .table("repricing_changes")
        .select("id", count="exact", head=True)
        .eq("tenant_id", tenant_id)
        .eq("actor_type", "automatic")
        .eq("status", "succeeded")
        .gte("created_at", since_iso)
        .execute()
    )
    return int(response.count or 0)


async def create_repricing_change(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("repricing_changes").insert(
            {**values, "tenant_id": tenant_id}
        )
    )
    return rows[0]


async def update_repricing_change(
    tenant_id: str, change_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("repricing_changes")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", change_id)
    )
    return rows[0] if rows else None


async def get_repricing_change(tenant_id: str, change_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("repricing_changes").select("*").eq("tenant_id", tenant_id).eq("id", change_id).limit(1)
    )
    return rows[0] if rows else None


async def list_repricing_changes(tenant_id: str, limit: int = 100) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase().table("repricing_changes").select("*,product_variants(name,sku,currency,external_refs,product_id,is_default)").eq("tenant_id", tenant_id).order("created_at", desc=True).limit(limit)
    )


async def list_public_incidents(limit: int = 50) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase().table("public_incidents").select("*").order("started_at", desc=True).limit(limit)
    )


async def create_public_incident(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("public_incidents").insert(values))
    return rows[0]


async def update_public_incident(incident_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("public_incidents").update({**values, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", incident_id)
    )
    return rows[0] if rows else None


async def delete_public_incident(incident_id: str) -> bool:
    return bool(await _execute(lambda: get_supabase().table("public_incidents").delete().eq("id", incident_id)))


async def insert_csp_violation(values: dict[str, Any]) -> None:
    await _execute(lambda: get_supabase().table("csp_violation_reports").insert(values))


async def upsert_internal_cost_rate(metric: str, cost_eur_per_unit: float) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("internal_cost_rates").upsert({"metric": metric, "cost_eur_per_unit": cost_eur_per_unit, "updated_at": datetime.now(timezone.utc).isoformat()}, on_conflict="metric")
    )
    return rows[0]


async def create_recovery_drill(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("recovery_drills").insert(values))
    return rows[0]


async def list_recovery_drills() -> list[dict[str, Any]]:
    return await _execute(lambda: get_supabase().table("recovery_drills").select("*").order("created_at", desc=True))


async def list_backup_verifications() -> list[dict[str, Any]]:
    return await _execute(lambda: get_supabase().table("backup_verifications").select("*").order("backup_observed_at", desc=True))


async def create_backup_verification(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("backup_verifications").insert(values))
    return rows[0]


async def list_operator_records(table: str) -> list[dict[str, Any]]:
    allowed = {"security_incidents", "billing_reconciliation_exceptions", "source_repair_assignments"}
    if table not in allowed:
        raise ValueError("Unsupported operator record")
    return await _execute(lambda: get_supabase().table(table).select("*").order("created_at", desc=True))


async def create_operator_record(table: str, values: dict[str, Any]) -> dict[str, Any]:
    allowed = {"security_incidents", "billing_reconciliation_exceptions", "source_repair_assignments"}
    if table not in allowed:
        raise ValueError("Unsupported operator record")
    rows = await _execute(lambda: get_supabase().table(table).insert(values))
    return rows[0]


async def update_operator_record(table: str, record_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
    allowed = {"security_incidents", "billing_reconciliation_exceptions", "source_repair_assignments"}
    if table not in allowed:
        raise ValueError("Unsupported operator record")
    rows = await _execute(lambda: get_supabase().table(table).update(values).eq("id", record_id))
    return rows[0] if rows else None


async def upsert_capacity_evaluation(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("capacity_evaluations").upsert(values, on_conflict="window_started_at,metric")
    )
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


async def mark_source_scrape_success(
    tenant_id: str, competitor_product_id: str, scraped_at: str
) -> None:
    await _execute(
        lambda: get_supabase()
        .table("competitor_products")
        .update(
            {
                "health_status": "healthy",
                "consecutive_failures": 0,
                "last_failure_at": None,
                "last_failure_reason": None,
                "last_successful_scrape_at": scraped_at,
                "broken_reason": None,
                "repaired_at": scraped_at,
            }
        )
        .eq("tenant_id", tenant_id)
        .eq("id", competitor_product_id)
    )


async def mark_source_scrape_failure(
    tenant_id: str,
    competitor_product_id: str,
    error: str,
    *,
    failed_at: str,
    broken_threshold: int = 3,
) -> dict[str, Any] | None:
    current = await get_product_mapping(tenant_id, competitor_product_id)
    if not current:
        return None
    failures = int(current.get("consecutive_failures") or 0) + 1
    health_status = "broken" if failures >= broken_threshold else "degraded"
    values = {
        "consecutive_failures": failures,
        "last_failure_at": failed_at,
        "last_failure_reason": error,
        "health_status": health_status,
        "broken_reason": error if health_status == "broken" else None,
    }
    return await update_product_mapping(tenant_id, competitor_product_id, values)


async def get_latest_prices(tenant_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("v_latest_prices")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("delta_pct", desc=True)
    )


async def list_recent_snapshots(tenant_id: str, limit: int = 2000) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("price_snapshots")
        .select("competitor_product_id,price,in_stock,scrape_ok,scraped_at,validation_state")
        .eq("tenant_id", tenant_id)
        .order("scraped_at", desc=True)
        .limit(limit)
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


async def get_recent_source_snapshots(
    tenant_id: str, competitor_product_id: str, limit: int = 2
) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("price_snapshots")
        .select("price,in_stock,scrape_ok,scraped_at,validation_state")
        .eq("tenant_id", tenant_id)
        .eq("competitor_product_id", competitor_product_id)
        .eq("validation_state", "valid")
        .order("scraped_at", desc=True)
        .limit(limit)
    )


async def get_product_insight_by_fingerprint(
    tenant_id: str, variant_id: str, fingerprint: str
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("product_insights")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("variant_id", variant_id)
        .eq("state_fingerprint", fingerprint)
        .limit(1)
    )
    return rows[0] if rows else None


async def create_product_insight(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("product_insights").insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


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


async def list_alert_events_since(tenant_id: str, since_iso: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("alert_events")
        .select(
            "*, alerts(condition), "
            "competitor_products(competitor_url, products(name), competitors(shop_name))"
        )
        .eq("tenant_id", tenant_id)
        .gte("triggered_at", since_iso)
        .order("triggered_at", desc=False)
    )


async def create_alert_digest_run(
    tenant_id: str, digest_date: str, recipient: str
) -> dict[str, Any] | None:
    await _execute(
        lambda: get_supabase()
        .table("alert_digest_runs")
        .upsert(
            {
                "tenant_id": tenant_id,
                "digest_date": digest_date,
                "recipient": recipient,
            },
            on_conflict="tenant_id,digest_date",
            ignore_duplicates=True,
        )
    )
    rows = await _execute(
        lambda: get_supabase()
        .table("alert_digest_runs")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("digest_date", digest_date)
        .limit(1)
    )
    return rows[0] if rows else None


async def update_alert_digest_run(
    tenant_id: str, run_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("alert_digest_runs")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", run_id)
    )
    return rows[0] if rows else None


async def get_alert_digest_run(tenant_id: str, run_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("alert_digest_runs")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", run_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def create_alert_channel_delivery(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase()
        .table("alert_channel_deliveries")
        .insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def update_alert_channel_delivery(
    delivery_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("alert_channel_deliveries")
        .update(values)
        .eq("id", delivery_id)
    )
    return rows[0] if rows else None


async def list_alert_channel_deliveries(
    tenant_id: str, limit: int = 100
) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("alert_channel_deliveries")
        .select("*, alert_events(alert_id, competitor_product_id, triggered_at)")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .limit(limit)
    )


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


async def update_team_member(tenant_id: str, user_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("team_members")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("user_id", user_id)
    )
    return rows[0] if rows else None


async def count_owner_members(tenant_id: str) -> int:
    response = await asyncio.to_thread(
        lambda: get_supabase()
        .table("team_members")
        .select("id", count="exact", head=True)
        .eq("tenant_id", tenant_id)
        .eq("role", "owner")
        .execute()
    )
    return int(response.count or 0)


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
        .select(
            "id,tenant_id,type,name,config,provider_details,credential_metadata,"
            "active,last_sync_at,last_sync_status,last_sync_error,items_seen,"
            "items_imported,items_updated,items_failed,created_at"
        )
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
    )
    safe_rows = []
    for row in rows:
        config = row.get("config") or {}
        safe_config = {
            key: value
            for key, value in config.items()
            if key
            not in {
                "access_token",
                "access_token_ciphertext",
                "consumer_secret",
                "consumer_secret_ciphertext",
                "api_secret",
            }
        }
        safe_rows.append({**row, "config": safe_config})
    return safe_rows


async def get_connector_source(tenant_id: str, connector_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("connector_sources")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", connector_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def update_connector_source(
    tenant_id: str, connector_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("connector_sources")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", connector_id)
    )
    return rows[0] if rows else None


async def delete_connector_source(tenant_id: str, connector_id: str) -> bool:
    rows = await _execute(
        lambda: get_supabase()
        .table("connector_sources")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", connector_id)
    )
    return bool(rows)


async def insert_audit_event(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(lambda: get_supabase().table("audit_events").insert(values))
    return rows[0]


async def list_audit_events(tenant_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("audit_events").select("*")
        if tenant_id:
            query = query.eq("tenant_id", tenant_id)
        return query.order("created_at", desc=True).limit(limit)

    return await _execute(build)


async def create_scrape_job(tenant_id: str, competitor_product_id: str, state: str = "queued") -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase()
        .table("scrape_jobs")
        .insert(
            {
                "tenant_id": tenant_id,
                "competitor_product_id": competitor_product_id,
                "state": state,
                **({"started_at": datetime.now(timezone.utc).isoformat()} if state == "running" else {}),
            }
        )
    )
    return rows[0]


async def start_scrape_job(tenant_id: str, competitor_product_id: str) -> dict[str, Any]:
    queued = await _execute(
        lambda: get_supabase()
        .table("scrape_jobs")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("competitor_product_id", competitor_product_id)
        .eq("state", "queued")
        .order("queued_at", desc=True)
        .limit(1)
    )
    now = datetime.now(timezone.utc).isoformat()
    if queued:
        rows = await _execute(
            lambda: get_supabase()
            .table("scrape_jobs")
            .update({"state": "running", "started_at": now})
            .eq("id", queued[0]["id"])
        )
        return rows[0]
    return await create_scrape_job(tenant_id, competitor_product_id, "running")


async def finish_scrape_job(job_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("scrape_jobs")
        .update({**values, "finished_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", job_id)
    )
    return rows[0] if rows else None


async def list_scrape_jobs(tenant_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("scrape_jobs").select("*, competitor_products(competitor_url)")
        if tenant_id:
            query = query.eq("tenant_id", tenant_id)
        return query.order("queued_at", desc=True).limit(limit)

    return await _execute(build)


async def list_report_schedules(tenant_id: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("report_schedules")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
    )


async def get_report_schedule(tenant_id: str, schedule_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("report_schedules")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", schedule_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def create_report_schedule(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("report_schedules").insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def update_report_schedule(
    tenant_id: str, schedule_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("report_schedules")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", schedule_id)
    )
    return rows[0] if rows else None


async def delete_report_schedule(tenant_id: str, schedule_id: str) -> bool:
    rows = await _execute(
        lambda: get_supabase()
        .table("report_schedules")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", schedule_id)
    )
    return bool(rows)


async def create_report_run(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("report_runs").insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def get_report_run(tenant_id: str, run_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("report_runs")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", run_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def update_report_run(
    tenant_id: str, run_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("report_runs")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", run_id)
    )
    return rows[0] if rows else None


async def list_report_runs(tenant_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("report_runs").select("*, report_schedules(name)")
        if tenant_id:
            query = query.eq("tenant_id", tenant_id)
        return query.order("created_at", desc=True).limit(limit)

    return await _execute(build)


async def list_due_report_schedules(now: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("report_schedules")
        .select("*")
        .eq("active", True)
        .or_(f"next_run_at.is.null,next_run_at.lte.{now}")
    )


async def create_connector_sync_run(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase()
        .table("connector_sync_runs")
        .insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def get_connector_sync_run(tenant_id: str, run_id: str) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("connector_sync_runs")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("id", run_id)
        .limit(1)
    )
    return rows[0] if rows else None


async def update_connector_sync_run(
    tenant_id: str, run_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("connector_sync_runs")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", run_id)
    )
    return rows[0] if rows else None


async def list_connector_sync_runs(tenant_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    def build() -> Any:
        query = get_supabase().table("connector_sync_runs").select("*, connector_sources(name,type)")
        if tenant_id:
            query = query.eq("tenant_id", tenant_id)
        return query.order("created_at", desc=True).limit(limit)

    return await _execute(build)


async def create_privacy_request(tenant_id: str, values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase()
        .table("privacy_requests")
        .insert({**values, "tenant_id": tenant_id})
    )
    return rows[0]


async def list_privacy_requests(tenant_id: str, limit: int = 50) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("privacy_requests")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("requested_at", desc=True)
        .limit(limit)
    )


async def update_privacy_request(
    tenant_id: str, request_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase()
        .table("privacy_requests")
        .update(values)
        .eq("tenant_id", tenant_id)
        .eq("id", request_id)
    )
    return rows[0] if rows else None


async def list_due_privacy_deletions(now_iso: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase()
        .table("privacy_requests")
        .select("*")
        .in_("status", ["cooling_off", "scheduled"])
        .lte("scheduled_for", now_iso)
    )


async def create_privacy_deletion_receipt(values: dict[str, Any]) -> dict[str, Any]:
    rows = await _execute(
        lambda: get_supabase().table("privacy_deletion_receipts").insert(values)
    )
    return rows[0]


async def list_pending_privacy_receipts(now_iso: str) -> list[dict[str, Any]]:
    return await _execute(
        lambda: get_supabase().table("privacy_deletion_receipts").select("*").in_("delivery_status", ["pending", "failed"]).not_.is_("recipient_email", "null").limit(100)
    )


async def update_privacy_deletion_receipt(receipt_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
    rows = await _execute(
        lambda: get_supabase().table("privacy_deletion_receipts").update(values).eq("id", receipt_id)
    )
    return rows[0] if rows else None


async def erase_expired_receipt_emails(now_iso: str) -> None:
    await _execute(
        lambda: get_supabase().table("privacy_deletion_receipts").update({"recipient_email": None, "delivery_status": "email_erased"}).lte("erase_recipient_at", now_iso).not_.is_("recipient_email", "null")
    )


async def delete_tenant(tenant_id: str) -> bool:
    rows = await _execute(
        lambda: get_supabase().table("tenants").delete().eq("id", tenant_id)
    )
    return bool(rows)
