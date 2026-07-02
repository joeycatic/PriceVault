"""Connector sync jobs for product imports."""

import csv
import io
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any

import httpx

from auth.plan_guard import assert_plan_capacity
from db import queries
from db.client import supabase_context
from security.crypto import decrypt_secret
from scrapers.shopify_catalog import fetch_shopify_products


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _price(value: Any) -> float | None:
    text = _text(value)
    if not text:
        return None
    normalized = text.replace("EUR", "").replace("€", "").replace(",", ".").strip()
    try:
        return float(normalized.split()[0])
    except (ValueError, IndexError):
        return None


async def _upsert_products(tenant: dict, products: list[dict[str, Any]]) -> dict[str, int]:
    existing = await queries.list_products(tenant["id"])
    by_sku = {
        str(product.get("our_sku")).casefold(): product
        for product in existing
        if product.get("our_sku")
    }
    by_name = {str(product.get("name")).casefold(): product for product in existing}
    active_count = len([product for product in existing if product.get("active", True)])
    imported = 0
    updated = 0
    failed = 0
    for product in products:
        name = _text(product.get("name"))
        if not name:
            failed += 1
            continue
        sku = _text(product.get("sku"))
        match = by_sku.get(sku.casefold()) if sku else None
        match = match or by_name.get(name.casefold())
        values = {
            "name": name,
            "our_sku": sku,
            "our_price": _price(product.get("price")),
            "our_currency": "EUR",
        }
        if match:
            await queries.update_product(tenant["id"], match["id"], values)
            updated += 1
            continue
        assert_plan_capacity(tenant.get("plan"), "products", active_count, 1)
        created = await queries.create_product(tenant["id"], values)
        if sku:
            by_sku[sku.casefold()] = created
        by_name[name.casefold()] = created
        active_count += 1
        imported += 1
    return {
        "items_seen": len(products),
        "items_imported": imported,
        "items_updated": updated,
        "items_failed": failed,
    }


async def _shopify_products(source: dict) -> list[dict[str, Any]]:
    config = source.get("config") or {}
    token = decrypt_secret(config["access_token_ciphertext"])
    rows = []
    async for product in fetch_shopify_products(config["shop_domain"], token):
        variant = product["variants"][0] if product.get("variants") else {}
        rows.append(
            {
                "name": product.get("title"),
                "sku": variant.get("sku"),
                "price": variant.get("price"),
            }
        )
    return rows


async def _woocommerce_products(source: dict) -> list[dict[str, Any]]:
    config = source.get("config") or {}
    base_url = str(config.get("base_url") or "").rstrip("/")
    secret = decrypt_secret(config["consumer_secret_ciphertext"])
    params = {
        "consumer_key": config.get("consumer_key"),
        "consumer_secret": secret,
        "per_page": 100,
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{base_url}/wp-json/wc/v3/products", params=params, timeout=30)
        response.raise_for_status()
    return [
        {
            "name": item.get("name"),
            "sku": item.get("sku"),
            "price": item.get("price") or item.get("regular_price"),
        }
        for item in response.json()
    ]


async def _csv_feed_products(source: dict) -> list[dict[str, Any]]:
    config = source.get("config") or {}
    async with httpx.AsyncClient() as client:
        response = await client.get(str(config.get("url") or config.get("feed_url")), timeout=30)
        response.raise_for_status()
    reader = csv.DictReader(io.StringIO(response.text))
    rows = []
    for item in reader:
        rows.append(
            {
                "name": item.get("name") or item.get("title") or item.get("product_name"),
                "sku": item.get("sku") or item.get("id") or item.get("g:id"),
                "price": item.get("price") or item.get("g:price"),
            }
        )
    return rows


async def _google_merchant_products(source: dict) -> list[dict[str, Any]]:
    config = source.get("config") or {}
    async with httpx.AsyncClient() as client:
        response = await client.get(str(config.get("url") or config.get("feed_url")), timeout=30)
        response.raise_for_status()
    text = response.text.strip()
    if not text.startswith("<"):
        return await _csv_feed_products(source)
    root = ET.fromstring(text)
    rows = []
    for item in root.findall(".//item"):
        fields = {child.tag.split("}")[-1]: child.text for child in item}
        rows.append(
            {
                "name": fields.get("title"),
                "sku": fields.get("id"),
                "price": fields.get("price"),
            }
        )
    return rows


async def _fetch_products(source: dict) -> list[dict[str, Any]]:
    if source["type"] == "shopify":
        return await _shopify_products(source)
    if source["type"] == "woocommerce":
        return await _woocommerce_products(source)
    if source["type"] == "google_merchant":
        return await _google_merchant_products(source)
    return await _csv_feed_products(source)


async def sync_connector_run(
    ctx: dict, *, tenant_id: str, connector_id: str, run_id: str
) -> dict[str, int | str]:
    del ctx
    started_at = datetime.now(timezone.utc).isoformat()
    with supabase_context(admin=True):
        tenant = await queries.get_tenant_by_id(tenant_id)
        source = await queries.get_connector_source(tenant_id, connector_id)
        if not tenant or not source:
            return {"status": "missing"}
        await queries.update_connector_sync_run(
            tenant_id,
            run_id,
            {"status": "running", "started_at": started_at},
        )
        await queries.update_connector_source(
            tenant_id,
            connector_id,
            {"last_sync_status": "running", "last_sync_at": started_at},
        )

    try:
        products = await _fetch_products(source)
        with supabase_context(admin=True):
            stats = await _upsert_products(tenant, products)
            finished_at = datetime.now(timezone.utc).isoformat()
            await queries.update_connector_sync_run(
                tenant_id,
                run_id,
                {"status": "succeeded", "finished_at": finished_at, **stats},
            )
            await queries.update_connector_source(
                tenant_id,
                connector_id,
                {
                    "last_sync_status": "succeeded",
                    "last_sync_error": None,
                    "last_sync_at": finished_at,
                    **stats,
                },
            )
        return {"status": "succeeded", **stats}
    except Exception as exc:
        finished_at = datetime.now(timezone.utc).isoformat()
        with supabase_context(admin=True):
            await queries.update_connector_sync_run(
                tenant_id,
                run_id,
                {
                    "status": "failed",
                    "finished_at": finished_at,
                    "error": str(exc)[:1000],
                    "items_failed": 1,
                },
            )
            await queries.update_connector_source(
                tenant_id,
                connector_id,
                {
                    "last_sync_status": "failed",
                    "last_sync_error": str(exc)[:1000],
                    "items_failed": 1,
                    "last_sync_at": finished_at,
                },
            )
        raise
