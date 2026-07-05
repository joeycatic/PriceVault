"""Guarded rule-based repricing suggestions and approved write-back."""

import os
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

import httpx

from db import queries
from security.crypto import decrypt_secret


CENT = Decimal("0.01")


def automatic_apply_blocker(
    *,
    current_price: float | None,
    suggested_price: float,
    max_change_pct: float,
    sources_healthy: bool,
    require_healthy_sources: bool,
    evidence_valid: bool = True,
    evidence_fresh: bool = True,
    currency_matches: bool = True,
) -> str | None:
    if current_price is None or current_price <= 0:
        return "Für die automatische Anwendung fehlt ein gültiger Ausgangspreis"
    if require_healthy_sources and not sources_healthy:
        return "Mindestens eine Preisquelle ist degradiert oder defekt"
    if not evidence_valid:
        return "Der Preis ist nicht als belastbarer Verkaufspreis validiert"
    if not evidence_fresh:
        return "Die Preisdaten sind veraltet"
    if not currency_matches:
        return "Währung oder Variante stimmen nicht mit der eigenen Variante überein"
    change_pct = abs(suggested_price - current_price) / current_price * 100
    if change_pct > max_change_pct:
        return f"Preisänderung von {change_pct:.1f} % überschreitet das Limit von {max_change_pct:.1f} %"
    if change_pct > 5:
        return f"Preisänderung von {change_pct:.1f} % erfordert immer eine manuelle Freigabe"
    return None


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
        tenant = await queries.get_tenant_by_id(tenant_id)
        automatic_plan_enabled = bool(tenant and tenant.get("plan") == "agency")
        rules = await queries.list_repricing_rules(tenant_id, active_only=True)
        variants = await queries.list_product_variants(tenant_id, active_only=True)
        prices = await queries.get_latest_prices(tenant_id)
        price_by_variant: dict[str, list[float]] = {}
        healthy_by_variant: dict[str, bool] = {}
        evidence_by_variant: dict[str, list[dict[str, Any]]] = {}
        for row in prices:
            variant_id = row["variant_id"]
            healthy_by_variant[variant_id] = (
                healthy_by_variant.get(variant_id, True)
                and row.get("health_status") == "healthy"
            )
            if row.get("competitor_price") is not None:
                evidence_by_variant.setdefault(variant_id, []).append(row)
                price_by_variant.setdefault(variant_id, []).append(
                    float(row["competitor_price"])
                )

        rules.sort(
            key=lambda rule: 2 if rule.get("variant_id") else 1 if rule.get("product_id") else 0,
            reverse=True,
        )
        created = 0
        skipped_missing_cost = 0
        skipped_no_price = 0
        auto_applied = 0
        auto_blocked = 0
        auto_failed = 0
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
            suggestion = await queries.upsert_pending_reprice_suggestion(
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
                    "evidence_snapshot_ids": [
                        row["snapshot_id"]
                        for row in evidence_by_variant.get(variant["id"], [])
                        if row.get("snapshot_id")
                    ],
                },
            )
            created += 1
            if rule.get("approval_mode") != "automatic":
                continue
            if not automatic_plan_enabled:
                await queries.update_reprice_suggestion(
                    tenant_id,
                    suggestion["id"],
                    {"writeback_error": "Automatische Anwendung erfordert den Agency-Plan"},
                )
                auto_blocked += 1
                continue
            automation_enabled = os.getenv("ENABLE_AUTOMATIC_REPRICING", "false").lower() == "true"
            kill_switch = os.getenv("AUTOMATIC_REPRICING_KILL_SWITCH", "true").lower() == "true"
            if not automation_enabled or kill_switch or bool(tenant.get("automatic_repricing_suspended")):
                await queries.update_reprice_suggestion(
                    tenant_id,
                    suggestion["id"],
                    {"writeback_error": "Automatische Preisänderungen sind sicherheitsbedingt deaktiviert"},
                )
                auto_blocked += 1
                continue
            today = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)
            if await queries.count_automatic_repricing_changes_since(tenant_id, today.isoformat()) >= 20:
                await queries.update_reprice_suggestion(
                    tenant_id,
                    suggestion["id"],
                    {"writeback_error": "Tageslimit von 20 automatischen Preisänderungen erreicht"},
                )
                auto_blocked += 1
                continue
            evidence = evidence_by_variant.get(variant["id"], [])
            now = datetime.now(timezone.utc)
            evidence_fresh = bool(evidence) and all(
                now - datetime.fromisoformat(str(row["scraped_at"]).replace("Z", "+00:00"))
                <= timedelta(hours=min(24, 2 * int(row.get("scrape_freq_h") or 12)))
                for row in evidence
            )
            currency_matches = bool(evidence) and all(
                row.get("competitor_currency") == variant.get("currency")
                and (not row.get("expected_variant") or row.get("expected_variant") == variant.get("name"))
                for row in evidence
            )
            blocker = automatic_apply_blocker(
                current_price=float(variant["our_price"]) if variant.get("our_price") is not None else None,
                suggested_price=suggested,
                max_change_pct=float(rule.get("max_change_pct") or 10),
                sources_healthy=healthy_by_variant.get(variant["id"], False),
                require_healthy_sources=rule.get("require_healthy_sources", True),
                evidence_valid=bool(evidence) and all(row.get("validation_state") == "valid" for row in evidence),
                evidence_fresh=evidence_fresh,
                currency_matches=currency_matches,
            )
            if blocker:
                await queries.update_reprice_suggestion(
                    tenant_id,
                    suggestion["id"],
                    {"writeback_error": blocker},
                )
                auto_blocked += 1
                continue
            applied_at = datetime.now(timezone.utc).isoformat()
            try:
                writeback_status = await self.apply(tenant_id, suggestion, actor_type="automatic")
            except Exception as exc:
                await queries.update_reprice_suggestion(
                    tenant_id,
                    suggestion["id"],
                    {
                        "status": "failed",
                        "writeback_status": "failed",
                        "writeback_error": str(exc)[:1000],
                        "reviewed_at": applied_at,
                    },
                )
                auto_failed += 1
                continue
            await queries.update_reprice_suggestion(
                tenant_id,
                suggestion["id"],
                {
                    "status": "applied",
                    "writeback_status": writeback_status,
                    "writeback_error": None,
                    "reviewed_at": applied_at,
                    "applied_at": applied_at,
                },
            )
            await queries.insert_audit_event(
                {
                    "tenant_id": tenant_id,
                    "action": "reprice_suggestion.auto_applied",
                    "resource_type": "reprice_suggestion",
                    "resource_id": suggestion["id"],
                    "metadata": {
                        "rule_id": rule["id"],
                        "previous_price": variant.get("our_price"),
                        "suggested_price": suggested,
                        "writeback_status": writeback_status,
                    },
                }
            )
            auto_applied += 1
        return {
            "suggestions": created,
            "skipped_missing_cost": skipped_missing_cost,
            "skipped_no_price": skipped_no_price,
            "auto_applied": auto_applied,
            "auto_blocked": auto_blocked,
            "auto_failed": auto_failed,
        }

    async def _write_remote(self, tenant_id: str, variant: dict, price: float) -> dict[str, Any]:
        refs = variant.get("external_refs") or {}
        connector_id = refs.get("connector_id")
        if not connector_id:
            return {"status": "local_only", "provider": None}
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
            return {"status": "succeeded", "provider": "shopify", "status_code": response.status_code, "request_id": response.headers.get("x-request-id")}
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
            return {"status": "succeeded", "provider": "woocommerce", "status_code": response.status_code, "request_id": response.headers.get("x-request-id")}
        return {"status": "local_only", "provider": source["type"]}

    async def apply(
        self,
        tenant_id: str,
        suggestion: dict,
        *,
        actor_type: str = "user",
        actor_id: str | None = None,
    ) -> str:
        variant = await queries.get_product_variant(tenant_id, suggestion["variant_id"])
        if not variant:
            raise RuntimeError("Variante nicht gefunden")
        price = float(suggestion["suggested_price"])
        change = await queries.create_repricing_change(
            tenant_id,
            {
                "suggestion_id": suggestion.get("id"),
                "variant_id": variant["id"],
                "actor_type": actor_type,
                "actor_id": actor_id,
                "pre_change_value": variant.get("our_price"),
                "requested_value": price,
                "status": "started",
                "rollback_state": "available" if variant.get("our_price") is not None else "not_available",
            },
        )
        try:
            connector_response = await self._write_remote(tenant_id, variant, price)
            await queries.update_product_variant(tenant_id, variant["id"], {"our_price": price})
            if variant.get("is_default"):
                await queries.update_product(tenant_id, variant["product_id"], {"our_price": price})
        except Exception as exc:
            await queries.update_repricing_change(
                tenant_id,
                change["id"],
                {"status": "failed", "error": str(exc)[:1000], "completed_at": datetime.now(timezone.utc).isoformat()},
            )
            raise
        await queries.update_repricing_change(
            tenant_id,
            change["id"],
            {"status": "succeeded", "connector_response": connector_response, "completed_at": datetime.now(timezone.utc).isoformat()},
        )
        return str(connector_response["status"])

    async def rollback(self, tenant_id: str, change: dict, *, actor_id: str | None) -> dict[str, Any]:
        tenant = await queries.get_tenant_by_id(tenant_id)
        if not tenant:
            raise RuntimeError("Mandant nicht gefunden")
        if os.getenv("AUTOMATIC_REPRICING_KILL_SWITCH", "true").lower() == "true":
            raise RuntimeError("Der globale Preisänderungs-Kill-Switch ist aktiv")
        if bool(tenant.get("automatic_repricing_suspended")):
            raise RuntimeError("Preisänderungen sind für diesen Mandanten ausgesetzt")
        if change.get("status") != "succeeded" or change.get("rollback_state") != "available":
            raise RuntimeError("Diese Preisänderung kann nicht zurückgesetzt werden")
        if change.get("pre_change_value") is None or not change.get("variant_id"):
            raise RuntimeError("Vorheriger Preis ist nicht verfügbar")
        variant = await queries.get_product_variant(tenant_id, change["variant_id"])
        if not variant:
            raise RuntimeError("Variante nicht gefunden")
        previous = float(change["pre_change_value"])
        attempts = list((change.get("connector_response") or {}).get("rollback_attempts") or [])
        attempt = {"actor_id": actor_id, "started_at": datetime.now(timezone.utc).isoformat()}
        await queries.update_repricing_change(tenant_id, change["id"], {"rollback_state": "requested"})
        try:
            response = await self._write_remote(tenant_id, variant, previous)
            await queries.update_product_variant(tenant_id, variant["id"], {"our_price": previous})
            if variant.get("is_default"):
                await queries.update_product(tenant_id, variant["product_id"], {"our_price": previous})
        except Exception as exc:
            attempt.update({"state": "failed", "error": str(exc)[:1000], "completed_at": datetime.now(timezone.utc).isoformat()})
            await queries.update_repricing_change(tenant_id, change["id"], {
                "rollback_state": "failed", "error": str(exc)[:1000],
                "connector_response": {**(change.get("connector_response") or {}), "rollback_attempts": [*attempts, attempt]},
            })
            raise
        attempt.update({"state": "completed", "connector_response": response, "completed_at": datetime.now(timezone.utc).isoformat()})
        return await queries.update_repricing_change(tenant_id, change["id"], {
            "status": "rolled_back", "rollback_state": "completed", "error": None,
            "connector_response": {**(change.get("connector_response") or {}), "rollback_attempts": [*attempts, attempt]},
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }) or change
