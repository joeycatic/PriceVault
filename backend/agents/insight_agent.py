"""Material-change product commentary via Anthropic."""

import hashlib
import json
import os
from statistics import median
from typing import Any

from anthropic import AsyncAnthropic

from db import queries


def is_material_change(current: dict[str, Any], previous: dict[str, Any] | None) -> bool:
    if previous is None:
        return True
    current_price = current.get("price")
    previous_price = previous.get("price")
    if current.get("in_stock") != previous.get("in_stock"):
        return True
    if current_price is None or previous_price is None:
        return current_price != previous_price
    if float(previous_price) == 0:
        return float(current_price) != 0
    return abs(float(current_price) - float(previous_price)) / float(previous_price) >= 0.02


class InsightAgent:
    async def generate_for_source(
        self, tenant_id: str, competitor_product_id: str
    ) -> dict[str, str]:
        if not os.getenv("ANTHROPIC_API_KEY"):
            return {"status": "skipped", "reason": "ANTHROPIC_API_KEY fehlt"}
        mapping = await queries.get_product_mapping(tenant_id, competitor_product_id)
        if not mapping:
            return {"status": "missing"}
        snapshots = [
            row
            for row in await queries.get_recent_source_snapshots(
                tenant_id, competitor_product_id, 3
            )
            if row.get("scrape_ok")
        ]
        if not snapshots or not is_material_change(
            snapshots[0], snapshots[1] if len(snapshots) > 1 else None
        ):
            return {"status": "skipped", "reason": "keine wesentliche Änderung"}

        variant = await queries.get_product_variant(tenant_id, mapping["variant_id"])
        if not variant:
            return {"status": "missing"}
        market_rows = [
            row
            for row in await queries.get_latest_prices(tenant_id)
            if row.get("variant_id") == variant["id"] and row.get("competitor_price") is not None
        ]
        prices = [float(row["competitor_price"]) for row in market_rows]
        if not prices:
            return {"status": "skipped", "reason": "keine Marktpreise"}
        floor = (
            float(variant["cost_price"]) * 1.2
            if variant.get("cost_price") is not None
            else 0
        )
        corridor_min = round(max(min(prices) * 0.98, floor), 2)
        corridor_max = round(max(corridor_min, median(prices) if len(prices) > 1 else prices[0] * 1.02), 2)
        state = {
            "variant_id": variant["id"],
            "prices": sorted(prices),
            "stock": [row.get("in_stock") for row in market_rows],
            "health": [row.get("health_status") for row in market_rows],
            "corridor": [corridor_min, corridor_max],
        }
        fingerprint = hashlib.sha256(
            json.dumps(state, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        insight_lookup = queries.get_product_insight_by_fingerprint
        if await insight_lookup(tenant_id, variant["id"], fingerprint):
            return {"status": "exists"}

        model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
        prompt = (
            "Du bist Preisanalyst für einen deutschen Onlinehändler. Antworte ausschließlich "
            "als JSON mit commentary und corridor_reason. commentary: 2 natürliche deutsche "
            "Sätze, konkret warum die Änderung wichtig ist. corridor_reason: 1 Satz zur "
            "empfohlenen Spanne. Keine Rechts- oder Erfolgsgarantie. Daten: "
            + json.dumps(
                {
                    "produkt": (mapping.get("products") or {}).get("name"),
                    "variante": variant.get("name"),
                    "eigener_preis": variant.get("our_price"),
                    "einstandspreis": variant.get("cost_price"),
                    "marktpreise": prices,
                    "preisbereich": [corridor_min, corridor_max],
                },
                ensure_ascii=False,
            )
        )
        response = await AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"]).messages.create(
            model=model,
            max_tokens=350,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        payload = json.loads(raw)
        insight = await queries.create_product_insight(
            tenant_id,
            {
                "product_id": mapping["product_id"],
                "variant_id": variant["id"],
                "state_fingerprint": fingerprint,
                "commentary": str(payload["commentary"])[:2000],
                "corridor_min": corridor_min,
                "corridor_max": corridor_max,
                "corridor_reason": str(payload["corridor_reason"])[:1000],
                "model": model,
                "source_payload": state,
            },
        )
        return {"status": "created", "insight_id": insight["id"]}
