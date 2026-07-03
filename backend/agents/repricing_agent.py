"""Guarded rule-based repricing suggestions and approved write-back."""

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

import httpx

from db import queries
from security.crypto import decrypt_secret


CENT = Decimal("0.01")


def calculate_suggested_price(
    *,
    lowest_competitor_price: float,
    cost_price: float,
    strategy: str,
    beat_by_pct: float,
    min_margin_pct: float,
) -> tuple[float, float]:
    lowest = Decimal(str(lowest_competitor_price))
    cost = Decimal(str(cost_price))
    floor = cost * (Decimal("1") + Decimal(str(min_margin_pct)) / Decimal("100"))
    target = lowest
    if strategy == "beat_percent":
        target = lowest * (Decimal("1") - Decimal(str(beat_by_pct)) / Decimal("100"))
    return (
        float(max(target, floor).quantize(CENT, rounding=ROUND_HALF_UP)),
        float(floor.quantize(CENT, rounding=ROUND_HALF_UP)),
    )


class RepricingAgent:
    async def generate(self, tenant_id: str) -> dict[str, int]:
        rules = await queries.list_repricing_rules(tenant_id, active_only=True)
        variants = await queries.list_product_variants(tenant_id, active_only=True)
        prices = await queries.get_latest_prices(tenant_id)
        price_by_variant: dict[str, list[float]] = {}
        for row in prices:
            if row.get("competitor_price") is not None:
                price_by_variant.setdefault(row["variant_id"], []).append(
                    float(row["competitor_price"])
                )

        rules.sort(
            key=lambda rule: 2 if rule.get("variant_id") else 1 if rule.get("product_id") else 0,
            reverse=True,
        )
        created = 0
        skipped_missing_cost = 0
        skipped_no_price = 0
        for variant in variants:
            rule = next(
                (
                    candidate
                    for candidate in rules
                    if (
                        not candidate.get("variant_id")
                        or candidate["variant_id"] == variant["id"]
                    )
                    and (
                        not candidate.get("product_id")
                        or candidate["product_id"] == variant["product_id"]
                    )
                ),
                None,
            )
            if not rule:
                continue
            if variant.get("cost_price") is None:
                skipped_missing_cost += 1
                continue
            competitor_prices = price_by_variant.get(variant["id"], [])
            if not competitor_prices:
                skipped_no_price += 1
                continue
            lowest = min(competitor_prices)
            suggested, floor = calculate_suggested_price(
                lowest_competitor_price=lowest,
                cost_price=float(variant["cost_price"]),
                strategy=rule["strategy"],
                beat_by_pct=float(rule.get("beat_by_pct") or 0),
                min_margin_pct=float(rule["min_margin_pct"]),
            )
            if variant.get("our_price") is not None and suggested == float(variant["our_price"]):
                continue
            await queries.upsert_pending_reprice_suggestion(
                tenant_id,
                variant["id"],
                {
                    "rule_id": rule["id"],
                    "product_id": variant["product_id"],
                    "previous_price": variant.get("our_price"),
                    "lowest_competitor_price": lowest,
                    "margin_floor": floor,
                    "suggested_price": suggested,
                    "writeback_status": "pending",
                    "writeback_error": None,
                },
            )
            created += 1
        return {
            "suggestions": created,
            "skipped_missing_cost": skipped_missing_cost,
            "skipped_no_price": skipped_no_price,
        }

    async def _write_remote(self, tenant_id: str, variant: dict, price: float) -> str:
        refs = variant.get("external_refs") or {}
        connector_id = refs.get("connector_id")
        if not connector_id:
            return "local_only"
        source = await queries.get_connector_source(tenant_id, connector_id)
        if not source or not source.get("active"):
            raise RuntimeError("Der zugehörige Store-Connector ist nicht aktiv")
        config = source.get("config") or {}
        if source["type"] == "shopify":
            token = decrypt_secret(config["access_token_ciphertext"])
            variant_id = refs.get("variant_id")
            if not variant_id:
                raise RuntimeError("Shopify-Variantenreferenz fehlt")
            url = (
                f"https://{config['shop_domain']}/admin/api/2024-04/variants/"
                f"{variant_id}.json"
            )
            async with httpx.AsyncClient() as client:
                response = await client.put(
                    url,
                    headers={"X-Shopify-Access-Token": token},
                    json={"variant": {"id": variant_id, "price": f"{price:.2f}"}},
                    timeout=30,
                )
                response.raise_for_status()
            return "succeeded"
        if source["type"] == "woocommerce":
            secret = decrypt_secret(config["consumer_secret_ciphertext"])
            product_id = refs.get("product_id")
            variant_id = refs.get("variant_id")
            if not product_id:
                raise RuntimeError("WooCommerce-Produktreferenz fehlt")
            path = f"products/{product_id}"
            if variant_id:
                path += f"/variations/{variant_id}"
            async with httpx.AsyncClient() as client:
                response = await client.put(
                    f"{config['base_url']}/wp-json/wc/v3/{path}",
                    params={
                        "consumer_key": config["consumer_key"],
                        "consumer_secret": secret,
                    },
                    json={"regular_price": f"{price:.2f}"},
                    timeout=30,
                )
                response.raise_for_status()
            return "succeeded"
        return "local_only"

    async def apply(self, tenant_id: str, suggestion: dict) -> str:
        variant = await queries.get_product_variant(tenant_id, suggestion["variant_id"])
        if not variant:
            raise RuntimeError("Variante nicht gefunden")
        price = float(suggestion["suggested_price"])
        writeback_status = await self._write_remote(tenant_id, variant, price)
        await queries.update_product_variant(tenant_id, variant["id"], {"our_price": price})
        if variant.get("is_default"):
            await queries.update_product(tenant_id, variant["product_id"], {"our_price": price})
        return writeback_status
