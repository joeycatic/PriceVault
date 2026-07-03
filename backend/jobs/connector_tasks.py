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


async def _upsert_catalog(
    tenant: dict, connector_id: str, products: list[dict[str, Any]]
) -> dict[str, int]:
    existing = await queries.list_products(tenant["id"])
    existing_variants = await queries.list_product_variants(tenant["id"])
    by_sku = {
        str(product.get("our_sku")).casefold(): product
        for product in existing
        if product.get("our_sku")
    }
    by_name = {str(product.get("name")).casefold(): product for product in existing}
    variant_by_sku = {
        str(variant.get("sku")).casefold(): variant
        for variant in existing_variants
        if variant.get("sku")
    }
    variant_by_gtin = {
        str(variant.get("gtin")): variant
        for variant in existing_variants
        if variant.get("gtin")
    }
    variant_by_remote = {}
    for variant in existing_variants:
        refs = variant.get("external_refs") or {}
        if refs.get("connector_id") == connector_id and refs.get("variant_id"):
            variant_by_remote[str(refs["variant_id"])] = variant
    active_count = len([product for product in existing if product.get("active", True)])
    imported = 0
    updated = 0
    failed = 0
    for product in products:
        name = _text(product.get("name"))
        if not name:
            failed += 1
            continue
        variants = product.get("variants") or [product]
        first_variant = variants[0]
        sku = _text(first_variant.get("sku"))
        remote_product_id = _text(product.get("remote_id"))
        remote_variant_match = next(
            (
                variant_by_remote.get(str(variant.get("remote_id")))
                for variant in variants
                if variant.get("remote_id") and variant_by_remote.get(str(variant.get("remote_id")))
            ),
            None,
        )
        match = None
        if remote_variant_match:
            match = next(
                (item for item in existing if item["id"] == remote_variant_match["product_id"]),
                None,
            )
        match = match or (by_sku.get(sku.casefold()) if sku else None)
        match = match or by_name.get(name.casefold())
        values = {
            "name": name,
            "our_sku": sku,
            "our_price": _price(first_variant.get("price")),
            "our_currency": "EUR",
        }
        if match:
            await queries.update_product(tenant["id"], match["id"], values)
            updated += 1
            product_row = match
        else:
            assert_plan_capacity(tenant.get("plan"), "products", active_count, 1)
            product_row = await queries.create_product(tenant["id"], values)
            if sku:
                by_sku[sku.casefold()] = product_row
            by_name[name.casefold()] = product_row
            active_count += 1
            imported += 1

        for index, variant in enumerate(variants):
            variant_sku = _text(variant.get("sku"))
            gtin = _text(variant.get("gtin"))
            remote_variant_id = _text(variant.get("remote_id"))
            variant_match = variant_by_remote.get(remote_variant_id) if remote_variant_id else None
            variant_match = variant_match or (
                variant_by_sku.get(variant_sku.casefold()) if variant_sku else None
            )
            variant_match = variant_match or (variant_by_gtin.get(gtin) if gtin else None)
            if variant_match and variant_match["product_id"] != product_row["id"]:
                variant_match = None
            variant_values = {
                "name": _text(variant.get("name")) or ("Standard" if len(variants) == 1 else f"Variante {index + 1}"),
                "sku": variant_sku,
                "gtin": gtin,
                "our_price": _price(variant.get("price")),
                "currency": "EUR",
                "is_default": index == 0,
                "external_refs": {
                    "connector_id": connector_id,
                    "product_id": remote_product_id,
                    "variant_id": remote_variant_id,
                },
            }
            if variant_match:
                await queries.update_product_variant(tenant["id"], variant_match["id"], variant_values)
            else:
                created_variant = await queries.create_product_variant(
                    tenant["id"], product_row["id"], variant_values
                )
                if variant_sku:
                    variant_by_sku[variant_sku.casefold()] = created_variant
                if gtin:
                    variant_by_gtin[gtin] = created_variant
                if remote_variant_id:
                    variant_by_remote[remote_variant_id] = created_variant
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
        rows.append(
            {
                "name": product.get("title"),
                "remote_id": product.get("id"),
                "variants": [
                    {
                        "remote_id": variant.get("id"),
                        "name": variant.get("title") or "Standard",
                        "sku": variant.get("sku"),
                        "gtin": variant.get("gtin"),
                        "price": variant.get("price"),
                    }
                    for variant in product.get("variants", [])
                ],
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
        products = response.json()
        rows = []
        for item in products:
            variants = []
            if item.get("variations"):
                variation_response = await client.get(
                    f"{base_url}/wp-json/wc/v3/products/{item['id']}/variations",
                    params=params,
                    timeout=30,
                )
                variation_response.raise_for_status()
                variants = [
                    {
                        "remote_id": str(variant["id"]),
                        "name": " / ".join(
                            str(attribute.get("option"))
                            for attribute in variant.get("attributes", [])
                            if attribute.get("option")
                        ) or "Variante",
                        "sku": variant.get("sku"),
                        "price": variant.get("price") or variant.get("regular_price"),
                    }
                    for variant in variation_response.json()
                ]
            if not variants:
                variants = [{
                    "remote_id": None,
                    "name": "Standard",
                    "sku": item.get("sku"),
                    "price": item.get("price") or item.get("regular_price"),
                }]
            rows.append({"remote_id": str(item["id"]), "name": item.get("name"), "variants": variants})
        return rows


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
                "remote_id": item.get("id") or item.get("g:id"),
                "variants": [{
                    "name": item.get("variant") or "Standard",
                    "sku": item.get("sku") or item.get("id") or item.get("g:id"),
                    "gtin": item.get("gtin") or item.get("ean") or item.get("g:gtin"),
                    "price": item.get("price") or item.get("g:price"),
                }],
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
                "remote_id": fields.get("id"),
                "variants": [{
                    "name": "Standard",
                    "sku": fields.get("id"),
                    "gtin": fields.get("gtin"),
                    "price": fields.get("price"),
                }],
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
            stats = await _upsert_catalog(tenant, connector_id, products)
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
