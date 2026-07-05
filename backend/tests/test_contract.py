"""Contract checks for the production buildout surface."""

import sys
from pathlib import Path
import asyncio
import anyio.to_thread
import bcrypt
import httpx2
import json


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class TestClient:
    """Synchronous facade over httpx2's native ASGI transport."""

    def __init__(self, app):
        self.app = app

    def request(self, method, url, **kwargs):
        async def send():
            original_to_thread = asyncio.to_thread
            original_run_sync = anyio.to_thread.run_sync

            async def run_inline(function, /, *args, **call_kwargs):
                return function(*args, **call_kwargs)

            transport = httpx2.ASGITransport(app=self.app)
            asyncio.to_thread = run_inline
            anyio.to_thread.run_sync = run_inline
            try:
                async with httpx2.AsyncClient(
                    transport=transport,
                    base_url="http://testserver",
                    follow_redirects=True,
                ) as client:
                    return await client.request(method, url, **kwargs)
            finally:
                asyncio.to_thread = original_to_thread
                anyio.to_thread.run_sync = original_run_sync

        return asyncio.run(send())

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)

    def patch(self, url, **kwargs):
        return self.request("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self.request("DELETE", url, **kwargs)


TestClient.__test__ = False


def test_openapi_contains_phase_routes():
    import main

    client = TestClient(main.app)
    paths = client.get("/openapi.json").json()["paths"]

    for path in (
        "/health",
        "/health/worker",
        "/scrape/run",
        "/billing/checkout",
        "/billing/cancel",
        "/webhooks/viva",
        "/onboarding/sequence",
        "/api-keys",
        "/alert-channels",
        "/alert-channels/deliveries",
        "/export/csv",
        "/export/pdf",
        "/team/invite",
        "/connectors",
        "/connectors/sync-runs",
        "/connectors/shopify/import",
        "/report-schedules",
        "/report-runs",
        "/privacy/requests",
        "/scrape/sources/{mapping_id}/repair",
        "/integrations/prices/latest",
        "/products/discover",
    ):
        assert path in paths


def test_request_context_returns_request_id_header():
    import main

    response = TestClient(main.app).get(
        "/openapi.json",
        headers={"X-Request-ID": "req-contract-1", "X-Tenant-ID": "tenant-1"},
    )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "req-contract-1"


def test_health_endpoint_checks_database_and_worker_queue(monkeypatch):
    import main

    async def fake_database():
        return {"reachable": "true"}

    async def fake_worker_queue():
        return {
            "queue": "arq:queue",
            "queued_jobs": 0,
            "max_jobs": 10,
            "queue_saturation": 0.0,
            "scale_hint": "idle",
        }

    monkeypatch.setattr(main, "_check_database", fake_database)
    monkeypatch.setattr(main, "_check_worker_queue", fake_worker_queue)

    response = TestClient(main.app).get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "checks": {
            "database": {"status": "ok", "reachable": "true"},
            "worker_queue": {
                "status": "ok",
                "queue": "arq:queue",
                "queued_jobs": 0,
                "max_jobs": 10,
                "queue_saturation": 0.0,
                "scale_hint": "idle",
            },
        },
    }


def test_health_endpoint_fails_when_a_probe_fails(monkeypatch):
    import main

    async def fake_database():
        return {"reachable": "true"}

    async def fake_worker_queue():
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(main, "_check_database", fake_database)
    monkeypatch.setattr(main, "_check_worker_queue", fake_worker_queue)

    response = TestClient(main.app).get("/health")

    assert response.status_code == 503
    assert response.json()["detail"] == {
        "status": "unhealthy",
        "checks": {
            "database": {"status": "ok", "reachable": "true"},
            "worker_queue": {"status": "error", "error": "RuntimeError"},
        },
    }


def test_tenant_routes_require_bearer_token():
    import main

    client = TestClient(main.app)
    response = client.get("/products", headers={"X-Tenant-ID": "tenant-1"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Supabase Bearer Token fehlt"


def test_scrape_run_requires_redis_url(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant

    async def fake_tenant():
        return {"id": "tenant-1", "plan": "free"}

    monkeypatch.delenv("REDIS_URL", raising=False)
    main.app.dependency_overrides[get_current_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        response = client.post(
            "/scrape/run",
            headers={"X-Tenant-ID": "tenant-1"},
            json={"tenant_id": "tenant-1", "competitor_product_ids": None},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"] == "REDIS_URL ist nicht konfiguriert"


def test_scrape_run_rejects_mismatched_tenant():
    import main
    from auth.dependencies import get_current_tenant

    async def fake_tenant():
        return {"id": "tenant-1", "plan": "free"}

    main.app.dependency_overrides[get_current_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        response = client.post(
            "/scrape/run",
            json={"tenant_id": "tenant-2", "competitor_product_ids": None},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Mandant stimmt nicht überein"


def test_scrape_run_enqueues_targets_and_closes_redis(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries
    from routers import scrape

    async def fake_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    async def fake_get_scrape_targets(tenant_id, competitor_product_ids):
        assert tenant_id == "tenant-1"
        assert competitor_product_ids == ["mapping-1", "mapping-2"]
        return [
            {"competitor_product_id": "mapping-1"},
            {"competitor_product_id": "mapping-2"},
        ]

    class FakeRedis:
        def __init__(self):
            self.jobs = []
            self.closed = False

        async def enqueue_job(self, *args, **kwargs):
            self.jobs.append((args, kwargs))
            return None if kwargs["competitor_product_id"] == "mapping-2" else {"job_id": "job-1"}

        async def aclose(self):
            self.closed = True

    redis = FakeRedis()

    async def fake_create_pool(redis_settings):
        assert redis_settings.host == "localhost"
        return redis

    async def fake_reserve(_redis, *, tenant_id, plan, requested):
        assert (tenant_id, plan, requested) == ("tenant-1", "pro", 2)
        return 2

    released = []

    async def fake_release(_redis, *, tenant_id, count):
        released.append((tenant_id, count))

    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379")
    monkeypatch.setattr(queries, "get_scrape_targets", fake_get_scrape_targets)
    monkeypatch.setattr(scrape, "create_pool", fake_create_pool)
    monkeypatch.setattr(scrape, "reserve_scrape_slots", fake_reserve)
    monkeypatch.setattr(scrape, "release_scrape_slots", fake_release)
    main.app.dependency_overrides[get_current_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        response = client.post(
            "/scrape/run",
            json={"tenant_id": "tenant-1", "competitor_product_ids": ["mapping-1", "mapping-2"]},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"queued": 1, "triggered": 2}
    assert redis.jobs == [
        (
            ("scrape_target",),
            {
                "competitor_product_id": "mapping-1",
                "tenant_id": "tenant-1",
                "quota_reserved": True,
            },
        ),
        (
            ("scrape_target",),
            {
                "competitor_product_id": "mapping-2",
                "tenant_id": "tenant-1",
                "quota_reserved": True,
            },
        ),
    ]
    assert released == [("tenant-1", 1)]
    assert redis.closed is True


def test_scrape_run_rejects_when_daily_slots_are_insufficient(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries
    from routers import scrape

    async def fake_tenant():
        return {"id": "tenant-1", "plan": "free"}

    async def fake_targets(_tenant_id, _ids):
        return [
            {"competitor_product_id": "mapping-1"},
            {"competitor_product_id": "mapping-2"},
        ]

    class FakeRedis:
        closed = False

        async def enqueue_job(self, *_args, **_kwargs):
            raise AssertionError("quota rejection must happen before enqueue")

        async def aclose(self):
            self.closed = True

    redis = FakeRedis()

    async def fake_pool(_settings):
        return redis

    async def fake_reserve(_redis, **_kwargs):
        return 1

    released = []

    async def fake_release(_redis, *, tenant_id, count):
        released.append((tenant_id, count))

    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379")
    monkeypatch.setattr(queries, "get_scrape_targets", fake_targets)
    monkeypatch.setattr(scrape, "create_pool", fake_pool)
    monkeypatch.setattr(scrape, "reserve_scrape_slots", fake_reserve)
    monkeypatch.setattr(scrape, "release_scrape_slots", fake_release)
    main.app.dependency_overrides[get_current_tenant] = fake_tenant
    try:
        response = TestClient(main.app).post(
            "/scrape/run",
            json={"tenant_id": "tenant-1", "competitor_product_ids": None},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 429
    assert response.json()["detail"] == "Tageslimit für Preisabrufe erreicht"
    assert released == [("tenant-1", 1)]
    assert redis.closed is True


def test_scrape_quota_reserves_from_persisted_daily_usage(monkeypatch):
    from auth import scrape_quota
    from db import queries

    async def fake_count(tenant_id, since):
        assert (tenant_id, since) == ("tenant-1", "2026-06-30T00:00:00+00:00")
        return 47

    class FakeRedis:
        def __init__(self):
            self.calls = []

        async def eval(self, *args):
            self.calls.append(args)
            return 3

    redis = FakeRedis()
    monkeypatch.setattr(queries, "count_snapshots_since", fake_count)
    monkeypatch.setattr(
        scrape_quota,
        "_utc_day",
        lambda: ("2026-06-30", "2026-06-30T00:00:00+00:00", 3600),
    )

    reserved = asyncio.run(
        scrape_quota.reserve_scrape_slots(
            redis, tenant_id="tenant-1", plan="free", requested=10
        )
    )

    assert reserved == 3
    assert redis.calls[0][1:] == (
        1,
        "scrape-quota:tenant-1:2026-06-30",
        47,
        50,
        10,
        3600,
    )


def test_tenant_routes_reject_mismatched_session(monkeypatch):
    import routers
    import main

    class FakeAuth:
        @staticmethod
        def get_user(token):
            assert token == "valid-token"
            return type("UserResponse", (), {"user": type("User", (), {"id": "user-1"})()})()

    class FakeQuery:
        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def limit(self, *_args):
            return self

        def execute(self):
            return type("Response", (), {"data": []})()

    class FakeClient:
        auth = FakeAuth()

        @staticmethod
        def table(_name):
            return FakeQuery()

    monkeypatch.setattr(routers, "get_supabase", lambda: FakeClient())

    client = TestClient(main.app)
    response = client.get(
        "/products",
        headers={"Authorization": "Bearer valid-token", "X-Tenant-ID": "tenant-2"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Mandant stimmt nicht mit der Sitzung überein"


def test_scrape_test_returns_sanitized_selector_result(monkeypatch):
    from datetime import datetime, timezone

    import main
    from agents.scraper_agent import ScrapeResult
    from routers import get_tenant
    from routers import scrape

    async def fake_tenant():
        yield "tenant-1"

    class FakeScraperAgent:
        async def scrape(self, target, persist=True):
            assert persist is False
            assert target.competitor_product_id == "selector-test"
            assert target.url == "https://shop.example/product"
            assert target.selector_price == ".price"
            assert target.selector_stock == ".stock"
            assert target.tenant_id == "tenant-1"
            return ScrapeResult(
                competitor_product_id="selector-test",
                price=99.99,
                currency="EUR",
                in_stock=True,
                raw_price_text="99,99 EUR",
                scrape_ok=True,
                error_msg=None,
                scraped_at=datetime(2026, 6, 30, tzinfo=timezone.utc),
            )

    monkeypatch.setattr(scrape, "ScraperAgent", FakeScraperAgent)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        response = client.post(
            "/scrape/test",
            json={
                "url": "https://shop.example/product",
                "selector_price": ".price",
                "selector_stock": ".stock",
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "price": 99.99,
        "in_stock": True,
        "raw_price_text": "99,99 EUR",
        "scrape_ok": True,
        "error_msg": None,
    }


def test_match_search_requires_existing_competitor(monkeypatch):
    import main
    from db import queries
    from routers import get_tenant

    async def fake_tenant():
        yield "tenant-1"

    async def fake_get_competitor(tenant_id, competitor_id):
        assert (tenant_id, competitor_id) == ("tenant-1", "competitor-1")
        return None

    monkeypatch.setattr(queries, "get_competitor", fake_get_competitor)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        response = client.post(
            "/match/search",
            json={"product_name": "Mars Hydro", "competitor_id": "competitor-1"},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "Mitbewerber nicht gefunden"


def test_match_search_returns_candidates(monkeypatch):
    from dataclasses import dataclass

    import main
    from db import queries
    from routers import get_tenant
    from routers import scrape

    async def fake_tenant():
        yield "tenant-1"

    async def fake_get_competitor(tenant_id, competitor_id):
        assert (tenant_id, competitor_id) == ("tenant-1", "competitor-1")
        return {"id": "competitor-1", "base_url": "https://competitor.example"}

    @dataclass
    class FakeCandidate:
        title: str
        url: str
        score: float

    class FakeMatcherAgent:
        async def search(self, request):
            assert request.product_name == "Mars Hydro"
            assert request.competitor_id == "competitor-1"
            assert request.competitor_base_url == "https://competitor.example"
            return [
                FakeCandidate(
                    title="Mars Hydro SP3000",
                    url="https://competitor.example/sp3000",
                    score=0.91,
                )
            ]

    monkeypatch.setattr(queries, "get_competitor", fake_get_competitor)
    monkeypatch.setattr(scrape, "MatcherAgent", FakeMatcherAgent)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        response = client.post(
            "/match/search",
            json={"product_name": "Mars Hydro", "competitor_id": "competitor-1"},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "candidates": [
            {
                "title": "Mars Hydro SP3000",
                "url": "https://competitor.example/sp3000",
                "score": 0.91,
            }
        ]
    }


def test_match_suggestion_generate_approve_and_reject_are_tenant_scoped(monkeypatch):
    from dataclasses import dataclass

    import main
    from auth.dependencies import get_current_tenant
    from db import queries
    from routers import scrape

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro", "_role": "owner", "user_id": "user-1"}

    async def fake_variant(tenant_id, variant_id):
        assert tenant_id == "tenant-1"
        return {
            "id": variant_id,
            "product_id": "product-1",
            "name": "Schwarz",
            "gtin": "4006381333931",
        }

    async def fake_product(tenant_id, product_id):
        assert (tenant_id, product_id) == ("tenant-1", "product-1")
        return {"id": product_id, "name": "Lampe"}

    async def fake_competitor(tenant_id, competitor_id):
        assert (tenant_id, competitor_id) == ("tenant-1", "competitor-1")
        return {"id": competitor_id, "base_url": "https://shop.example"}

    mappings = []
    stored = []
    suggestions = {
        "suggestion-approve": {
            "id": "suggestion-approve",
            "tenant_id": "tenant-1",
            "product_id": "product-1",
            "variant_id": "variant-1",
            "competitor_id": "competitor-1",
            "candidate_url": "https://shop.example/lampe",
            "status": "pending",
        },
        "suggestion-reject": {
            "id": "suggestion-reject",
            "tenant_id": "tenant-1",
            "product_id": "product-1",
            "variant_id": "variant-1",
            "competitor_id": "competitor-2",
            "candidate_url": "https://shop.example/falsch",
            "status": "pending",
        },
    }

    async def fake_existing_mapping(_tenant_id, variant_id, competitor_id):
        return next(
            (
                row
                for row in mappings
                if row["variant_id"] == variant_id and row["competitor_id"] == competitor_id
            ),
            None,
        )

    @dataclass
    class FakeCandidate:
        url: str
        title: str
        confidence: float

    class FakeMatcherAgent:
        async def search(self, request):
            assert request.gtin == "4006381333931"
            return [FakeCandidate("https://shop.example/lampe", "Lampe GTIN", 1.0)]

    async def fake_create_suggestions(values):
        stored.extend(values)

    async def fake_list(_tenant_id, _status="pending", variant_id=None, competitor_id=None):
        assert (variant_id, competitor_id) == ("variant-1", "competitor-1")
        return [{"id": "generated", **stored[0]}]

    async def fake_get_suggestion(tenant_id, suggestion_id):
        assert tenant_id == "tenant-1"
        return suggestions.get(suggestion_id)

    async def fake_create_mapping(tenant_id, product_id, values):
        row = {"id": "mapping-1", "tenant_id": tenant_id, "product_id": product_id, **values}
        mappings.append(row)
        return row

    async def fake_update_suggestion(tenant_id, suggestion_id, values):
        assert tenant_id == "tenant-1"
        suggestions[suggestion_id].update(values)
        return suggestions[suggestion_id]

    async def fake_audit(*_args, **_kwargs):
        return None

    monkeypatch.setattr(queries, "get_product_variant", fake_variant)
    monkeypatch.setattr(queries, "get_product", fake_product)
    monkeypatch.setattr(queries, "get_competitor", fake_competitor)
    monkeypatch.setattr(queries, "get_mapping_for_variant_competitor", fake_existing_mapping)
    monkeypatch.setattr(queries, "create_match_suggestions", fake_create_suggestions)
    monkeypatch.setattr(queries, "list_match_suggestions", fake_list)
    monkeypatch.setattr(queries, "get_match_suggestion", fake_get_suggestion)
    monkeypatch.setattr(queries, "create_product_mapping", fake_create_mapping)
    monkeypatch.setattr(queries, "update_match_suggestion", fake_update_suggestion)
    monkeypatch.setattr(scrape, "MatcherAgent", FakeMatcherAgent)
    monkeypatch.setattr(scrape, "record_audit_event", fake_audit)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        generated = client.post(
            "/match/suggestions/generate",
            json={"variant_id": "variant-1", "competitor_id": "competitor-1"},
        )
        approved = client.post("/match/suggestions/suggestion-approve/approve")
        rejected = client.post("/match/suggestions/suggestion-reject/reject")
    finally:
        main.app.dependency_overrides.clear()

    assert generated.status_code == 201
    assert generated.json()[0]["match_method"] == "gtin"
    assert stored[0]["tenant_id"] == "tenant-1"
    assert approved.status_code == 200
    assert approved.json()["mapping"]["variant_id"] == "variant-1"
    assert suggestions["suggestion-approve"]["status"] == "approved"
    assert rejected.status_code == 200
    assert suggestions["suggestion-reject"]["status"] == "rejected"
    assert len(mappings) == 1


def test_plan_rank_order():
    from fastapi import HTTPException

    from auth.plan_guard import PLAN_RANK, assert_scrape_frequency, plan_limit

    assert PLAN_RANK["free"] < PLAN_RANK["pro"] < PLAN_RANK["agency"]
    assert PLAN_RANK["trial"] == PLAN_RANK["free"]
    assert plan_limit("free", "products") == 5
    assert plan_limit("pro", "products") == 50
    assert plan_limit("agency", "products") is None
    assert plan_limit("free", "alerts") == 3
    assert plan_limit("pro", "alerts") is None
    assert plan_limit("free", "competitors") == 2
    assert plan_limit("pro", "competitors") == 10
    assert plan_limit("agency", "competitors") is None
    assert_scrape_frequency("agency", 1)
    assert_scrape_frequency("pro", 6)
    assert_scrape_frequency("free", 12)
    try:
        assert_scrape_frequency("free", 6)
    except HTTPException as exc:
        assert exc.status_code == 403
    else:
        raise AssertionError("free plan accepted a six-hour scrape interval")


def test_repricing_calculation_never_crosses_margin_floor():
    from agents.repricing_agent import calculate_suggested_price

    matched, matched_floor = calculate_suggested_price(
        lowest_competitor_price=90,
        cost_price=80,
        strategy="match_lowest",
        beat_by_pct=0,
        min_margin_pct=25,
    )
    beaten, beaten_floor = calculate_suggested_price(
        lowest_competitor_price=120,
        cost_price=80,
        strategy="beat_percent",
        beat_by_pct=5,
        min_margin_pct=25,
    )

    assert (matched, matched_floor) == (100.0, 100.0)
    assert (beaten, beaten_floor) == (114.0, 100.0)


def test_public_catalog_parses_shopify_and_product_json_ld():
    from scrapers.public_catalog import parse_product_page, parse_shopify_catalog

    shopify = parse_shopify_catalog(
        {
            "products": [
                {
                    "title": "Grow Lampe",
                    "handle": "grow-lampe",
                    "variants": [{"price": "199.90", "sku": "GL-1", "barcode": "1234567890123"}],
                }
            ]
        },
        "https://shop.example",
        10,
    )
    json_ld = parse_product_page(
        '''<script type="application/ld+json">{
          "@type":"Product","name":"Lüfter","sku":"LF-2",
          "offers":{"@type":"Offer","price":"89.50","priceCurrency":"EUR"}
        }</script>''',
        "https://shop.example/produkt/luefter",
    )

    assert shopify == [{
        "name": "Grow Lampe",
        "url": "https://shop.example/products/grow-lampe",
        "sku": "GL-1",
        "gtin": "1234567890123",
        "price": 199.9,
        "currency": "EUR",
        "source": "shopify",
    }]
    assert json_ld["name"] == "Lüfter"
    assert json_ld["price"] == 89.5
    assert json_ld["sku"] == "LF-2"


def test_public_catalog_rejects_private_destinations():
    from scrapers.public_catalog import validate_public_shop_url

    assert validate_public_shop_url("shop.example") == "https://shop.example"
    for value in ("http://127.0.0.1", "http://localhost:8000", "http://10.0.0.2"):
        try:
            validate_public_shop_url(value)
        except ValueError:
            pass
        else:
            raise AssertionError(f"private catalog URL accepted: {value}")


def test_matcher_ranks_product_title_above_navigation_links():
    from agents.matcher_agent import MatcherAgent, MatchRequest

    request = MatchRequest("Rezin 1 Liter", "competitor-1", "https://shop.example")
    candidates = MatcherAgent()._rank(
        request,
        [
            ("https://shop.example/heizer", "Heizer"),
            ("https://shop.example/Green-Planet-Rizen-1-Liter", "Green Planet Rezin 1 Liter"),
            ("https://shop.example/registrieren", "Jetzt registrieren!"),
        ],
    )

    assert candidates[0].title == "Green Planet Rezin 1 Liter"
    assert candidates[0].confidence > candidates[1].confidence


def test_automatic_repricing_guards_large_changes_and_source_health():
    from agents.repricing_agent import automatic_apply_blocker

    assert automatic_apply_blocker(
        current_price=100,
        suggested_price=95,
        max_change_pct=10,
        sources_healthy=True,
        require_healthy_sources=True,
    ) is None
    assert "überschreitet" in automatic_apply_blocker(
        current_price=100,
        suggested_price=75,
        max_change_pct=10,
        sources_healthy=True,
        require_healthy_sources=True,
    )
    assert "degradiert" in automatic_apply_blocker(
        current_price=100,
        suggested_price=95,
        max_change_pct=10,
        sources_healthy=False,
        require_healthy_sources=True,
    )


def test_product_insight_material_change_threshold():
    from agents.insight_agent import is_material_change

    assert is_material_change({"price": 98, "in_stock": True}, {"price": 100, "in_stock": True})
    assert not is_material_change({"price": 99, "in_stock": True}, {"price": 100, "in_stock": True})
    assert is_material_change({"price": 100, "in_stock": False}, {"price": 100, "in_stock": True})
    assert is_material_change({"price": 100, "in_stock": True}, None)


def test_product_create_enforces_plan_product_limit(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "free"}

    async def fake_count_active_products(tenant_id):
        assert tenant_id == "tenant-1"
        return 5

    async def fake_create_product(_tenant_id, _values):
        raise AssertionError("product should not be created after limit failure")

    monkeypatch.setattr(queries, "count_active_products", fake_count_active_products)
    monkeypatch.setattr(queries, "create_product", fake_create_product)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/products", json={"name": "Lampe"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Dein Plan erlaubt maximal 5 aktive Produkte."


def test_product_create_allows_unlimited_agency_products(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency"}

    async def fake_count_active_products(tenant_id):
        assert tenant_id == "tenant-1"
        return 500

    async def fake_create_product(tenant_id, values):
        assert tenant_id == "tenant-1"
        return {"id": "product-1", **values}

    async def fake_create_variant(tenant_id, product_id, values):
        assert (tenant_id, product_id) == ("tenant-1", "product-1")
        assert values["is_default"] is True
        return {"id": "variant-1", **values}

    monkeypatch.setattr(queries, "count_active_products", fake_count_active_products)
    monkeypatch.setattr(queries, "create_product", fake_create_product)
    monkeypatch.setattr(queries, "create_product_variant", fake_create_variant)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/products", json={"name": "Lampe"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["id"] == "product-1"


def test_product_routes_list_update_delete_and_mappings(monkeypatch):
    import main
    from db import queries
    from routers import get_tenant

    async def fake_tenant():
        yield "tenant-1"

    async def fake_list_products(tenant_id):
        assert tenant_id == "tenant-1"
        return [{"id": "product-1", "name": "Lampe"}]

    async def fake_update_product(tenant_id, product_id, values):
        assert tenant_id == "tenant-1"
        if product_id == "product-1":
            return {"id": product_id, **values}
        return None

    async def fake_soft_delete_product(tenant_id, product_id):
        assert tenant_id == "tenant-1"
        return product_id == "product-1"

    async def fake_list_product_mappings(tenant_id, product_id):
        assert (tenant_id, product_id) == ("tenant-1", "product-1")
        return [{"id": "mapping-1", "competitor_url": "https://shop.example/p"}]

    async def fake_create_product_mapping(tenant_id, product_id, values):
        assert (tenant_id, product_id) == ("tenant-1", "product-1")
        return {"id": "mapping-2", "tenant_id": tenant_id, "product_id": product_id, **values}

    async def fake_get_product(tenant_id, product_id):
        return {"id": product_id, "active": True} if tenant_id == "tenant-1" else None

    async def fake_get_competitor(tenant_id, competitor_id):
        return {"id": competitor_id} if tenant_id == "tenant-1" else None

    async def fake_get_variant(tenant_id, variant_id):
        if (tenant_id, variant_id) == ("tenant-1", "variant-1"):
            return {"id": variant_id, "product_id": "product-1"}
        return None

    async def fake_delete_product_mapping(tenant_id, mapping_id):
        assert tenant_id == "tenant-1"
        return mapping_id == "mapping-1"

    monkeypatch.setattr(queries, "list_products", fake_list_products)
    monkeypatch.setattr(queries, "update_product", fake_update_product)
    monkeypatch.setattr(queries, "soft_delete_product", fake_soft_delete_product)
    monkeypatch.setattr(queries, "list_product_mappings", fake_list_product_mappings)
    monkeypatch.setattr(queries, "create_product_mapping", fake_create_product_mapping)
    monkeypatch.setattr(queries, "get_product", fake_get_product)
    monkeypatch.setattr(queries, "get_competitor", fake_get_competitor)
    monkeypatch.setattr(queries, "get_product_variant", fake_get_variant)
    monkeypatch.setattr(queries, "delete_product_mapping", fake_delete_product_mapping)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        list_response = client.get("/products")
        update_response = client.patch("/products/product-1", json={"name": "Neue Lampe"})
        missing_update = client.patch("/products/missing", json={"name": "Fehlt"})
        mappings_response = client.get("/products/product-1/mappings")
        create_mapping_response = client.post(
            "/products/product-1/mappings",
            json={
                "competitor_id": "competitor-1",
                "variant_id": "variant-1",
                "competitor_url": "https://shop.example/p",
                "competitor_sku": "SKU-1",
                "selector_price": ".price",
            },
        )
        delete_mapping_response = client.delete("/products/product-1/mappings/mapping-1")
        missing_mapping_delete = client.delete("/products/product-1/mappings/missing")
        delete_response = client.delete("/products/product-1")
        missing_delete = client.delete("/products/missing")
    finally:
        main.app.dependency_overrides.clear()

    assert list_response.status_code == 200
    assert list_response.json() == [{"id": "product-1", "name": "Lampe"}]
    assert update_response.status_code == 200
    assert update_response.json() == {"id": "product-1", "name": "Neue Lampe"}
    assert missing_update.status_code == 404
    assert missing_update.json()["detail"] == "Produkt nicht gefunden"
    assert mappings_response.status_code == 200
    assert mappings_response.json() == [{"id": "mapping-1", "competitor_url": "https://shop.example/p"}]
    assert create_mapping_response.status_code == 201
    assert create_mapping_response.json()["id"] == "mapping-2"
    assert create_mapping_response.json()["competitor_url"] == "https://shop.example/p"
    assert delete_mapping_response.status_code == 204
    assert missing_mapping_delete.status_code == 404
    assert missing_mapping_delete.json()["detail"] == "Zuordnung nicht gefunden"
    assert delete_response.status_code == 204
    assert missing_delete.status_code == 404
    assert missing_delete.json()["detail"] == "Produkt nicht gefunden"


def test_product_variant_routes_are_tenant_and_product_scoped(monkeypatch):
    import main
    from db import queries
    from routers import get_tenant

    async def fake_tenant():
        yield "tenant-1"

    async def fake_get_product(tenant_id, product_id):
        assert tenant_id == "tenant-1"
        return {"id": product_id} if product_id == "product-1" else None

    async def fake_list(tenant_id, product_id):
        assert (tenant_id, product_id) == ("tenant-1", "product-1")
        return [{"id": "variant-1", "product_id": product_id, "name": "Schwarz"}]

    async def fake_create(tenant_id, product_id, values):
        assert (tenant_id, product_id) == ("tenant-1", "product-1")
        return {"id": "variant-2", "product_id": product_id, **values}

    async def fake_get_variant(tenant_id, variant_id):
        assert tenant_id == "tenant-1"
        if variant_id == "variant-1":
            return {"id": variant_id, "product_id": "product-1"}
        if variant_id == "foreign-product-variant":
            return {"id": variant_id, "product_id": "product-2"}
        return None

    async def fake_update(tenant_id, variant_id, values):
        assert (tenant_id, variant_id) == ("tenant-1", "variant-1")
        return {"id": variant_id, "product_id": "product-1", **values}

    monkeypatch.setattr(queries, "get_product", fake_get_product)
    monkeypatch.setattr(queries, "list_product_variants", fake_list)
    monkeypatch.setattr(queries, "create_product_variant", fake_create)
    monkeypatch.setattr(queries, "get_product_variant", fake_get_variant)
    monkeypatch.setattr(queries, "update_product_variant", fake_update)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        listed = client.get("/products/product-1/variants")
        created = client.post(
            "/products/product-1/variants",
            json={"name": "Weiß", "sku": "WHITE-1", "gtin": "4006381333931"},
        )
        updated = client.patch(
            "/products/product-1/variants/variant-1", json={"our_price": 119.9}
        )
        foreign = client.patch(
            "/products/product-1/variants/foreign-product-variant", json={"name": "Nein"}
        )
    finally:
        main.app.dependency_overrides.clear()

    assert listed.status_code == 200
    assert listed.json()[0]["name"] == "Schwarz"
    assert created.status_code == 201
    assert created.json()["gtin"] == "4006381333931"
    assert updated.status_code == 200
    assert updated.json()["our_price"] == 119.9
    assert foreign.status_code == 404


def test_due_scrape_targets_use_each_sources_last_success(monkeypatch):
    from datetime import datetime, timedelta, timezone

    from db import queries

    now = datetime.now(timezone.utc)

    async def fake_targets(_tenant_id):
        return [
            {
                "competitor_product_id": "stale",
                "scrape_freq_h": 6,
                "last_scraped_at": (now - timedelta(hours=7)).isoformat(),
            },
            {
                "competitor_product_id": "fresh",
                "scrape_freq_h": 6,
                "last_scraped_at": (now - timedelta(hours=5)).isoformat(),
            },
            {"competitor_product_id": "new", "scrape_freq_h": 12, "last_scraped_at": None},
        ]

    monkeypatch.setattr(queries, "get_scrape_targets", fake_targets)

    due = asyncio.run(queries.get_due_scrape_targets("tenant-1"))

    assert [row["competitor_product_id"] for row in due] == ["stale", "new"]


def test_mapping_create_rejects_tenant_foreign_references(monkeypatch):
    import main
    from db import queries
    from routers import get_tenant

    async def fake_tenant():
        yield "tenant-1"

    async def fake_get_product(_tenant_id, _product_id):
        return {"id": "product-1", "active": True}

    async def fake_get_competitor(_tenant_id, _competitor_id):
        return None

    async def fail_create(*_args):
        raise AssertionError("cross-tenant mapping must not be created")

    monkeypatch.setattr(queries, "get_product", fake_get_product)
    monkeypatch.setattr(queries, "get_competitor", fake_get_competitor)
    monkeypatch.setattr(queries, "create_product_mapping", fail_create)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        response = TestClient(main.app).post(
            "/products/product-1/mappings",
            json={
                "competitor_id": "foreign-competitor",
                "variant_id": "variant-1",
                "competitor_url": "https://shop.example/product",
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "Mitbewerber nicht gefunden"


def test_product_reactivation_enforces_plan_limit(monkeypatch):
    import main
    from db import queries
    from routers import get_tenant

    async def fake_tenant():
        yield "tenant-1"

    async def fake_get_product(tenant_id, product_id):
        assert (tenant_id, product_id) == ("tenant-1", "product-6")
        return {"id": product_id, "active": False}

    async def fake_get_tenant(tenant_id):
        return {"id": tenant_id, "plan": "free"}

    async def fake_count(tenant_id):
        assert tenant_id == "tenant-1"
        return 5

    async def fail_update(*_args):
        raise AssertionError("over-limit product must not be reactivated")

    monkeypatch.setattr(queries, "get_product", fake_get_product)
    monkeypatch.setattr(queries, "get_tenant_by_id", fake_get_tenant)
    monkeypatch.setattr(queries, "count_active_products", fake_count)
    monkeypatch.setattr(queries, "update_product", fail_update)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        response = TestClient(main.app).patch("/products/product-6", json={"active": True})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Dein Plan erlaubt maximal 5 aktive Produkte."


def test_alert_create_enforces_plan_alert_limit(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "free"}

    async def fake_count_active_alerts(tenant_id):
        assert tenant_id == "tenant-1"
        return 3

    async def fake_create_alert(_tenant_id, _values):
        raise AssertionError("alert should not be created after limit failure")

    monkeypatch.setattr(queries, "count_active_alerts", fake_count_active_alerts)
    monkeypatch.setattr(queries, "create_alert", fake_create_alert)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post(
            "/alerts",
            json={
                "condition": "below_pct",
                "threshold": 10,
                "notify_email": "ops@example.com",
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Dein Plan erlaubt maximal 3 aktive Preisalarme."


def test_alert_create_rejects_tenant_foreign_product(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "free"}

    async def fake_get_product(_tenant_id, _product_id):
        return None

    async def fail_create(*_args):
        raise AssertionError("cross-tenant alert must not be created")

    monkeypatch.setattr(queries, "get_product", fake_get_product)
    monkeypatch.setattr(queries, "create_alert", fail_create)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        response = TestClient(main.app).post(
            "/alerts",
            json={
                "product_id": "foreign-product",
                "condition": "below_pct",
                "threshold": 10,
                "notify_email": "ops@example.com",
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "Produkt nicht gefunden"


def test_alert_routes_list_update_delete_and_events(monkeypatch):
    import main
    from db import queries
    from routers import get_tenant

    async def fake_tenant():
        yield "tenant-1"

    async def fake_list_alerts(tenant_id):
        assert tenant_id == "tenant-1"
        return [{"id": "alert-1", "condition": "below_pct"}]

    async def fake_update_alert(tenant_id, alert_id, values):
        assert tenant_id == "tenant-1"
        if alert_id == "alert-1":
            return {"id": alert_id, **values}
        return None

    async def fake_delete_alert(tenant_id, alert_id):
        assert tenant_id == "tenant-1"
        return alert_id == "alert-1"

    async def fake_list_alert_events(tenant_id, limit):
        assert tenant_id == "tenant-1"
        assert limit == 25
        return [{"id": "event-1", "alert_id": "alert-1"}]

    monkeypatch.setattr(queries, "list_alerts", fake_list_alerts)
    monkeypatch.setattr(queries, "update_alert", fake_update_alert)
    monkeypatch.setattr(queries, "delete_alert", fake_delete_alert)
    monkeypatch.setattr(queries, "list_alert_events", fake_list_alert_events)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        list_response = client.get("/alerts")
        update_response = client.patch("/alerts/alert-1", json={"threshold": 12.5})
        missing_update = client.patch("/alerts/missing", json={"threshold": 12.5})
        events_response = client.get("/alerts/events?limit=25")
        delete_response = client.delete("/alerts/alert-1")
        missing_delete = client.delete("/alerts/missing")
    finally:
        main.app.dependency_overrides.clear()

    assert list_response.status_code == 200
    assert list_response.json() == [{"id": "alert-1", "condition": "below_pct"}]
    assert update_response.status_code == 200
    assert update_response.json() == {"id": "alert-1", "threshold": 12.5}
    assert missing_update.status_code == 404
    assert missing_update.json()["detail"] == "Preisalarm nicht gefunden"
    assert events_response.status_code == 200
    assert events_response.json() == [{"id": "event-1", "alert_id": "alert-1"}]
    assert delete_response.status_code == 204
    assert missing_delete.status_code == 404
    assert missing_delete.json()["detail"] == "Preisalarm nicht gefunden"


def test_alert_reactivation_enforces_plan_limit(monkeypatch):
    import main
    from db import queries
    from routers import get_tenant

    async def fake_tenant():
        yield "tenant-1"

    async def fake_get_alert(tenant_id, alert_id):
        assert (tenant_id, alert_id) == ("tenant-1", "alert-4")
        return {"id": alert_id, "active": False}

    async def fake_get_tenant(tenant_id):
        return {"id": tenant_id, "plan": "free"}

    async def fake_count(tenant_id):
        assert tenant_id == "tenant-1"
        return 3

    async def fail_update(*_args):
        raise AssertionError("over-limit alert must not be reactivated")

    monkeypatch.setattr(queries, "get_alert", fake_get_alert)
    monkeypatch.setattr(queries, "get_tenant_by_id", fake_get_tenant)
    monkeypatch.setattr(queries, "count_active_alerts", fake_count)
    monkeypatch.setattr(queries, "update_alert", fail_update)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        response = TestClient(main.app).patch("/alerts/alert-4", json={"active": True})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Dein Plan erlaubt maximal 3 aktive Preisalarme."


def test_shopify_import_enforces_product_limit_before_writing(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries
    from routers.connectors import shopify

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    async def fake_fetch_shopify_products(_shop_domain, _access_token):
        for index in range(2):
            yield {
                "title": f"Produkt {index}",
                "handle": f"produkt-{index}",
                "variants": [{"price": 10 + index, "sku": f"SKU-{index}"}],
            }

    async def fake_count_active_products(tenant_id):
        assert tenant_id == "tenant-1"
        return 49

    async def fake_create_connector_source(_tenant_id, _values):
        raise AssertionError("connector should not be saved after limit failure")

    async def fake_create_product(_tenant_id, _values):
        raise AssertionError("products should not be created after limit failure")

    monkeypatch.setenv("CONNECTOR_ENCRYPTION_KEY", "test-secret-for-connectors")
    monkeypatch.setattr(shopify, "fetch_shopify_products", fake_fetch_shopify_products)
    monkeypatch.setattr(queries, "count_active_products", fake_count_active_products)
    monkeypatch.setattr(queries, "create_connector_source", fake_create_connector_source)
    monkeypatch.setattr(queries, "create_product", fake_create_product)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post(
            "/connectors/shopify/import",
            json={"shop_domain": "shop.myshopify.com", "access_token": "shpat_testtoken"},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Dein Plan erlaubt maximal 50 aktive Produkte."


def test_shopify_import_rejects_non_shopify_domains():
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        response = TestClient(main.app).post(
            "/connectors/shopify/import",
            json={"shop_domain": "localhost:8080", "access_token": "shpat_testtoken"},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422


def test_shopify_import_requires_owner_or_admin():
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency", "_role": "member"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        response = TestClient(main.app).post(
            "/connectors/shopify/import",
            json={"shop_domain": "shop.myshopify.com", "access_token": "shpat_testtoken"},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Nur Owner und Admins dürfen Integrationen verwalten"


def test_shopify_import_creates_connector_and_products_for_agency(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries
    from routers.connectors import shopify

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency"}

    async def fake_fetch_shopify_products(_shop_domain, _access_token):
        yield {
            "id": "product-remote-1",
            "title": "Grow Light",
            "handle": "grow-light",
            "variants": [{"id": "variant-remote-1", "title": "Standard", "price": 129.9, "sku": "GL-1", "gtin": "4006381333931"}],
        }

    async def fake_count_active_products(tenant_id):
        assert tenant_id == "tenant-1"
        return 500

    connectors = []
    products = []

    async def fake_create_connector_source(tenant_id, values):
        connectors.append((tenant_id, values))
        return {"id": "connector-1", **values}

    async def fake_upsert_catalog(tenant, connector_id, catalog):
        products.extend(catalog)
        assert tenant["id"] == "tenant-1"
        assert connector_id == "connector-1"
        return {"items_seen": 1, "items_imported": 1, "items_updated": 0, "items_failed": 0}

    monkeypatch.setenv("CONNECTOR_ENCRYPTION_KEY", "test-secret-for-connectors")
    monkeypatch.setattr(shopify, "fetch_shopify_products", fake_fetch_shopify_products)
    monkeypatch.setattr(queries, "count_active_products", fake_count_active_products)
    monkeypatch.setattr(queries, "create_connector_source", fake_create_connector_source)
    monkeypatch.setattr(shopify, "_upsert_catalog", fake_upsert_catalog)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post(
            "/connectors/shopify/import",
            json={"shop_domain": "shop.myshopify.com", "access_token": "shpat_testtoken"},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"imported": 1, "updated": 0}
    assert connectors[0][0] == "tenant-1"
    assert "access_token_ciphertext" in connectors[0][1]["config"]
    assert connectors[0][1]["config"]["access_token_ciphertext"] != "shpat_testtoken"
    assert products[0]["remote_id"] == "product-remote-1"
    assert products[0]["variants"][0]["remote_id"] == "variant-remote-1"
    assert products[0]["variants"][0]["gtin"] == "4006381333931"


def test_catalog_upsert_creates_variant_store_references(monkeypatch):
    from db import queries
    from jobs.connector_tasks import _upsert_catalog

    async def empty_products(_tenant_id):
        return []

    async def empty_variants(_tenant_id, product_id=None, active_only=False):
        assert product_id is None
        return []

    async def create_product(tenant_id, values):
        assert tenant_id == "tenant-1"
        return {"id": "product-1", "active": True, **values}

    created_variants = []

    async def create_variant(tenant_id, product_id, values):
        assert (tenant_id, product_id) == ("tenant-1", "product-1")
        row = {"id": f"variant-{len(created_variants) + 1}", "product_id": product_id, **values}
        created_variants.append(row)
        return row

    monkeypatch.setattr(queries, "list_products", empty_products)
    monkeypatch.setattr(queries, "list_product_variants", empty_variants)
    monkeypatch.setattr(queries, "create_product", create_product)
    monkeypatch.setattr(queries, "create_product_variant", create_variant)

    result = asyncio.run(
        _upsert_catalog(
            {"id": "tenant-1", "plan": "agency"},
            "connector-1",
            [
                {
                    "remote_id": "remote-product",
                    "name": "Lampe",
                    "variants": [
                        {"remote_id": "remote-black", "name": "Schwarz", "sku": "L-B", "price": 99},
                        {"remote_id": "remote-white", "name": "Weiß", "sku": "L-W", "price": 109},
                    ],
                }
            ],
        )
    )

    assert result["items_imported"] == 1
    assert len(created_variants) == 2
    assert created_variants[0]["is_default"] is True
    assert created_variants[1]["external_refs"] == {
        "connector_id": "connector-1",
        "product_id": "remote-product",
        "variant_id": "remote-white",
    }


def test_connector_source_list_is_plan_gated_and_redacts_secret_config(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    async def fake_list_connector_sources(tenant_id):
        assert tenant_id == "tenant-1"
        return [
            {
                "id": "source-1",
                "tenant_id": tenant_id,
                "type": "shopify",
                "name": "shop.myshopify.com",
                "config": {
                    "shop_domain": "shop.myshopify.com",
                    "access_token": "plaintext",
                    "access_token_ciphertext": "encrypted",
                },
                "active": True,
                "last_sync_status": "succeeded",
                "items_imported": 3,
            }
        ]

    monkeypatch.setattr(queries, "list_connector_sources", fake_list_connector_sources)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        response = TestClient(main.app).get("/connectors")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "source-1",
            "tenant_id": "tenant-1",
            "type": "shopify",
            "name": "shop.myshopify.com",
            "config": {"shop_domain": "shop.myshopify.com"},
            "active": True,
            "last_sync_status": "succeeded",
            "items_imported": 3,
        }
    ]


def test_list_connector_sources_redacts_access_tokens(monkeypatch):
    from db import queries

    async def fake_execute(build):
        del build
        return [
            {
                "id": "source-1",
                "tenant_id": "tenant-1",
                "type": "shopify",
                "name": "shop.myshopify.com",
                "config": {
                    "shop_domain": "shop.myshopify.com",
                    "access_token": "plaintext",
                    "access_token_ciphertext": "encrypted",
                },
                "active": True,
                "provider_details": {},
                "credential_metadata": {},
                "last_sync_at": None,
                "last_sync_status": None,
                "last_sync_error": None,
                "items_seen": 0,
                "items_imported": 0,
                "items_updated": 0,
                "items_failed": 0,
                "created_at": "2026-07-01T00:00:00+00:00",
            }
        ]

    monkeypatch.setattr(queries, "_execute", fake_execute)

    rows = asyncio.run(queries.list_connector_sources("tenant-1"))

    assert rows == [
        {
            "id": "source-1",
            "tenant_id": "tenant-1",
            "type": "shopify",
            "name": "shop.myshopify.com",
            "config": {"shop_domain": "shop.myshopify.com"},
            "active": True,
            "provider_details": {},
            "credential_metadata": {},
            "last_sync_at": None,
            "last_sync_status": None,
            "last_sync_error": None,
            "items_seen": 0,
            "items_imported": 0,
            "items_updated": 0,
            "items_failed": 0,
            "created_at": "2026-07-01T00:00:00+00:00",
        }
    ]


def test_team_invite_requires_agency_plan():
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/team/invite", json={"email": "team@example.com"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Plan 'agency' oder höher erforderlich"


def test_agency_team_list_returns_members(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency"}

    async def fake_list_team_members(tenant_id):
        assert tenant_id == "tenant-1"
        return [
            {
                "id": "member-row-1",
                "tenant_id": tenant_id,
                "user_id": "user-1",
                "role": "admin",
                "accepted": True,
            }
        ]

    monkeypatch.setattr(queries, "list_team_members", fake_list_team_members)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.get("/team")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "member-row-1",
            "tenant_id": "tenant-1",
            "user_id": "user-1",
            "role": "admin",
            "accepted": True,
        }
    ]


def test_agency_team_invite_enforces_five_member_limit(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency"}

    async def fake_list_team_members(tenant_id):
        assert tenant_id == "tenant-1"
        return [{"user_id": f"user-{index}"} for index in range(5)]

    monkeypatch.setattr(queries, "list_team_members", fake_list_team_members)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/team/invite", json={"email": "team@example.com"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Sitzlimit für deinen Plan erreicht"


def test_agency_team_invite_creates_supabase_invite_and_member(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries
    from routers import team

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency"}

    async def fake_list_team_members(tenant_id):
        assert tenant_id == "tenant-1"
        return []

    inserts = []

    async def fake_insert_team_member(values):
        inserts.append(values)
        return values

    class FakeAdmin:
        @staticmethod
        def invite_user_by_email(email, options):
            assert email == "team@example.com"
            assert options == {"data": {"tenant_id": "tenant-1", "role": "member"}}
            return type("InviteResponse", (), {"user": type("User", (), {"id": "user-1"})()})()

    class FakeAuth:
        admin = FakeAdmin()

    class FakeClient:
        auth = FakeAuth()

    monkeypatch.setattr(queries, "list_team_members", fake_list_team_members)
    monkeypatch.setattr(queries, "insert_team_member", fake_insert_team_member)
    monkeypatch.setattr(team, "get_supabase_admin", lambda: FakeClient())
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/team/invite", json={"email": "team@example.com"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json() == {"invited": "team@example.com", "user_id": "user-1"}
    assert inserts == [
        {
            "tenant_id": "tenant-1",
            "user_id": "user-1",
            "role": "member",
            "accepted": False,
        }
    ]


def test_agency_team_remove_deletes_member(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency"}

    async def fake_delete_team_member(tenant_id, user_id):
        assert tenant_id == "tenant-1"
        assert user_id == "user-1"
        return True

    monkeypatch.setattr(queries, "delete_team_member", fake_delete_team_member)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.delete("/team/user-1")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 204


def test_alert_channel_create_requires_matching_config(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/alert-channels", json={"type": "webhook", "config": {}})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["detail"] == "Webhook-URL fehlt"


def test_alert_channel_create_persists_slack_channel(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries
    from security.crypto import decrypt_secret

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    created = []

    async def fake_create_alert_channel(tenant_id, values):
        created.append((tenant_id, values))
        return {"id": "channel-1", "tenant_id": tenant_id, **values}

    monkeypatch.setenv("CONNECTOR_ENCRYPTION_KEY", "test-secret-for-connectors")
    monkeypatch.setattr(queries, "create_alert_channel", fake_create_alert_channel)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post(
            "/alert-channels",
            json={
                "type": "slack",
                "config": {"webhook_url": "https://hooks.slack.com/services/test"},
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["id"] == "channel-1"
    assert response.json()["config"] == {"webhook_url": "https://hooks.slack.com/***"}
    assert created[0][0] == "tenant-1"
    assert created[0][1]["type"] == "slack"
    persisted_config = created[0][1]["config"]
    assert persisted_config.keys() == {"webhook_url_ciphertext"}
    assert persisted_config["webhook_url_ciphertext"] != "https://hooks.slack.com/services/test"
    assert decrypt_secret(persisted_config["webhook_url_ciphertext"]) == (
        "https://hooks.slack.com/services/test"
    )


def test_alert_channel_rejects_private_and_non_slack_targets():
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        private = client.post(
            "/alert-channels",
            json={"type": "webhook", "config": {"url": "http://127.0.0.1/internal"}},
        )
        fake_slack = client.post(
            "/alert-channels",
            json={
                "type": "slack",
                "config": {"webhook_url": "https://example.com/fake-slack"},
            },
        )
    finally:
        main.app.dependency_overrides.clear()

    assert private.status_code == 400
    assert private.json()["detail"] == "Private Webhook-Ziele sind nicht erlaubt"
    assert fake_slack.status_code == 400
    assert fake_slack.json()["detail"] == "Slack-Webhooks müssen hooks.slack.com verwenden"


def test_alert_channel_list_requires_pro_plan():
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "free"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.get("/alert-channels")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Plan 'pro' oder höher erforderlich"


def test_alert_channel_management_requires_owner_or_admin():
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency", "_role": "member"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        response = TestClient(main.app).get("/alert-channels")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Nur Owner und Admins dürfen Integrationen verwalten"


def test_alert_channel_list_returns_tenant_channels(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries
    from security.crypto import encrypt_secret

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    monkeypatch.setenv("CONNECTOR_ENCRYPTION_KEY", "test-secret-for-connectors")
    encrypted_url = encrypt_secret("https://hooks.example/test")

    async def fake_list_alert_channels(tenant_id):
        assert tenant_id == "tenant-1"
        return [
            {
                "id": "channel-1",
                "type": "webhook",
                "config": {"url_ciphertext": encrypted_url},
                "active": True,
            }
        ]

    monkeypatch.setattr(queries, "list_alert_channels", fake_list_alert_channels)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.get("/alert-channels")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "channel-1",
            "type": "webhook",
            "config": {"url": "https://hooks.example/***"},
            "active": True,
        }
    ]


def test_alert_channel_update_and_missing(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries
    from security.crypto import decrypt_secret

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    calls = []

    async def fake_get_alert_channel(tenant_id, channel_id):
        assert tenant_id == "tenant-1"
        if channel_id == "channel-1":
            return {"id": channel_id, "type": "webhook"}
        return None

    async def fake_update_alert_channel(tenant_id, channel_id, values):
        calls.append((tenant_id, channel_id, values))
        if channel_id == "channel-1":
            return {"id": channel_id, "tenant_id": tenant_id, **values}
        return None

    monkeypatch.setenv("CONNECTOR_ENCRYPTION_KEY", "test-secret-for-connectors")
    monkeypatch.setattr(queries, "get_alert_channel", fake_get_alert_channel)
    monkeypatch.setattr(queries, "update_alert_channel", fake_update_alert_channel)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        ok_response = client.patch(
            "/alert-channels/channel-1",
            json={"active": False, "config": {"url": "https://hooks.example/updated"}},
        )
        missing_response = client.patch("/alert-channels/missing", json={"active": False})
    finally:
        main.app.dependency_overrides.clear()

    assert ok_response.status_code == 200
    assert ok_response.json() == {
        "id": "channel-1",
        "tenant_id": "tenant-1",
        "active": False,
        "config": {"url": "https://hooks.example/***"},
    }
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "Kanal nicht gefunden"
    assert calls[0][0:2] == ("tenant-1", "channel-1")
    assert calls[0][2]["active"] is False
    persisted_config = calls[0][2]["config"]
    assert persisted_config.keys() == {"url_ciphertext"}
    assert persisted_config["url_ciphertext"] != "https://hooks.example/updated"
    assert decrypt_secret(persisted_config["url_ciphertext"]) == "https://hooks.example/updated"
    assert calls[1] == ("tenant-1", "missing", {"active": False})


def test_alert_channel_delete_and_missing(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    calls = []

    async def fake_delete_alert_channel(tenant_id, channel_id):
        calls.append((tenant_id, channel_id))
        return channel_id == "channel-1"

    monkeypatch.setattr(queries, "delete_alert_channel", fake_delete_alert_channel)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        ok_response = client.delete("/alert-channels/channel-1")
        missing_response = client.delete("/alert-channels/missing")
    finally:
        main.app.dependency_overrides.clear()

    assert ok_response.status_code == 204
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "Kanal nicht gefunden"
    assert calls == [("tenant-1", "channel-1"), ("tenant-1", "missing")]


def test_csv_export_downloads_snapshot_rows(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    async def fake_get_snapshot_history(tenant_id, competitor_product_id, since_iso):
        assert tenant_id == "tenant-1"
        assert competitor_product_id == "mapping-123456"
        assert since_iso
        return [
            {
                "scraped_at": "2026-06-30T08:00:00+00:00",
                "price": 99.99,
                "currency": "EUR",
                "in_stock": True,
                "scrape_ok": True,
                "error_msg": None,
            }
        ]

    monkeypatch.setattr(queries, "get_snapshot_history", fake_get_snapshot_history)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.get("/export/csv?competitor_product_id=mapping-123456&days=7")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "preisverlauf_mapping-" in response.headers["content-disposition"]
    assert "scraped_at,price,currency,in_stock,scrape_ok,error_msg" in response.text
    assert "2026-06-30T08:00:00+00:00,99.99,EUR,True,True," in response.text


def test_pdf_export_downloads_snapshot_rows(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    async def fake_get_snapshot_history(tenant_id, competitor_product_id, since_iso):
        assert tenant_id == "tenant-1"
        assert competitor_product_id == "mapping-123456"
        assert since_iso
        return [
            {
                "scraped_at": "2026-06-30T08:00:00+00:00",
                "price": 99.99,
                "currency": "EUR",
                "in_stock": True,
                "scrape_ok": True,
                "error_msg": None,
            }
        ]

    monkeypatch.setattr(queries, "get_snapshot_history", fake_get_snapshot_history)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.get("/export/pdf?competitor_product_id=mapping-123456&days=7")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert "preisverlauf_mapping-" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF-1.4")
    assert b"PriceVault Preisverlauf" in response.content
    assert b"2026-06-30T08:00:00+00:00 | 99.99 | EUR | True | True |" in response.content


def test_pdf_export_includes_all_rows_across_multiple_pages():
    from routers.export import _build_history_pdf

    rows = [
        {
            "scraped_at": f"2026-06-30T08:{index:02d}:00+00:00",
            "price": index,
            "currency": "EUR",
            "in_stock": True,
            "scrape_ok": True,
            "error_msg": None,
        }
        for index in range(60)
    ]

    pdf = _build_history_pdf("mapping-123456", rows)

    assert b"/Count 2" in pdf
    assert pdf.count(b"PriceVault Preisverlauf") == 2
    assert b"2026-06-30T08:59:00+00:00 | 59 | EUR | True | True |" in pdf


def test_api_key_route_authenticates(monkeypatch):
    import main
    from db import queries

    raw = "secret-token-value-that-is-long-enough-for-validation"
    expected_prefix = raw[:12]
    stored_hash = bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()

    async def fake_list_active_api_key_candidates(key_prefix):
        assert key_prefix == expected_prefix
        return [{"id": "key-1", "tenant_id": "tenant-1", "key_hash": stored_hash}]

    async def fake_touch_api_key(key_id):
        assert key_id == "key-1"

    async def fake_get_tenant_by_id(tenant_id):
        assert tenant_id == "tenant-1"
        return {"id": "tenant-1", "plan": "pro"}

    async def fake_get_latest_prices(tenant_id):
        assert tenant_id == "tenant-1"
        return [{"competitor_product_id": "cp-1"}, {"competitor_product_id": "cp-2"}]

    monkeypatch.setattr(
        queries, "list_active_api_key_candidates", fake_list_active_api_key_candidates
    )
    monkeypatch.setattr(queries, "touch_api_key", fake_touch_api_key)
    monkeypatch.setattr(queries, "get_tenant_by_id", fake_get_tenant_by_id)
    monkeypatch.setattr(queries, "get_latest_prices", fake_get_latest_prices)

    client = TestClient(main.app)
    response = client.get(
        "/integrations/prices/latest?limit=1", headers={"X-API-Key": f"pv_{raw}"}
    )

    assert response.status_code == 200
    assert response.json() == [{"competitor_product_id": "cp-1"}]


def test_api_key_auth_rejects_missing_prefix_before_lookup(monkeypatch):
    import main
    from db import queries

    async def unexpected_lookup(_prefix):
        raise AssertionError("malformed keys must not query stored hashes")

    monkeypatch.setattr(queries, "list_active_api_key_candidates", unexpected_lookup)

    response = TestClient(main.app).get(
        "/integrations/prices/latest",
        headers={"X-API-Key": "not-prefixed-but-long-enough-to-look-like-a-key"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Ungültiger API-Key"


def test_api_key_auth_rejects_short_prefixed_key_before_lookup(monkeypatch):
    import main
    from db import queries

    async def unexpected_lookup(_prefix):
        raise AssertionError("short keys must not query stored hashes")

    monkeypatch.setattr(queries, "list_active_api_key_candidates", unexpected_lookup)

    response = TestClient(main.app).get(
        "/integrations/prices/latest",
        headers={"X-API-Key": "pv_short"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Ungültiger API-Key"


def test_api_key_auth_rejects_valid_key_for_downgraded_tenant(monkeypatch):
    import main
    from db import queries

    raw = "secret-token-value-that-is-long-enough-for-validation"
    expected_prefix = raw[:12]
    stored_hash = bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()

    async def fake_list_active_api_key_candidates(key_prefix):
        assert key_prefix == expected_prefix
        return [{"id": "key-1", "tenant_id": "tenant-1", "key_hash": stored_hash}]

    async def fake_get_tenant_by_id(tenant_id):
        assert tenant_id == "tenant-1"
        return {"id": "tenant-1", "plan": "free"}

    async def unexpected_touch(_key_id):
        raise AssertionError("downgraded tenant usage must not touch the API key")

    monkeypatch.setattr(
        queries, "list_active_api_key_candidates", fake_list_active_api_key_candidates
    )
    monkeypatch.setattr(queries, "get_tenant_by_id", fake_get_tenant_by_id)
    monkeypatch.setattr(queries, "touch_api_key", unexpected_touch)

    response = TestClient(main.app).get(
        "/integrations/prices/latest?limit=1", headers={"X-API-Key": f"pv_{raw}"}
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Plan 'pro' oder höher erforderlich"


def test_api_key_management_requires_pro_plan():
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "free"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.get("/api-keys")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Plan 'pro' oder höher erforderlich"


def test_api_key_management_requires_owner_or_admin():
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency", "_role": "member"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        response = TestClient(main.app).get("/api-keys")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Nur Owner und Admins dürfen Integrationen verwalten"


def test_api_key_management_lists_keys(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    async def fake_list_api_keys(tenant_id):
        assert tenant_id == "tenant-1"
        return [{"id": "key-1", "name": "Warehouse Sync", "revoked": False}]

    monkeypatch.setattr(queries, "list_api_keys", fake_list_api_keys)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.get("/api-keys")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == [{"id": "key-1", "name": "Warehouse Sync", "revoked": False}]


def test_api_key_management_creates_one_time_bcrypt_key(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries
    from routers import api_keys

    raw = "raw-token-for-api-key"
    stored = []

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    async def fake_create_api_key(key_id, tenant_id, name, key_prefix, key_hash):
        stored.append(
            {
                "key_id": key_id,
                "tenant_id": tenant_id,
                "name": name,
                "key_prefix": key_prefix,
                "key_hash": key_hash,
            }
        )
        return {"id": key_id}

    monkeypatch.setattr(api_keys.secrets, "token_urlsafe", lambda _bytes: raw)
    monkeypatch.setattr(api_keys, "uuid4", lambda: "key-uuid")
    monkeypatch.setattr(queries, "create_api_key", fake_create_api_key)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/api-keys", json={"name": "Warehouse Sync"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json() == {"id": "key-uuid", "key": f"pv_{raw}"}
    assert stored[0]["tenant_id"] == "tenant-1"
    assert stored[0]["name"] == "Warehouse Sync"
    assert stored[0]["key_prefix"] == raw[:12]
    assert stored[0]["key_hash"] != raw
    assert bcrypt.checkpw(raw.encode(), stored[0]["key_hash"].encode())


def test_api_key_management_revoke_and_missing(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro"}

    calls = []

    async def fake_revoke_api_key(tenant_id, key_id):
        calls.append((tenant_id, key_id))
        return key_id == "key-1"

    monkeypatch.setattr(queries, "revoke_api_key", fake_revoke_api_key)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        ok_response = client.delete("/api-keys/key-1")
        missing_response = client.delete("/api-keys/missing")
    finally:
        main.app.dependency_overrides.clear()

    assert ok_response.status_code == 200
    assert ok_response.json() == {"revoked": True}
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "API-Key nicht gefunden"
    assert calls == [("tenant-1", "key-1"), ("tenant-1", "missing")]


def test_rate_limit_in_memory_counter(monkeypatch):
    from middleware.rate_limit import TenantPlanRateLimitMiddleware

    middleware = TenantPlanRateLimitMiddleware(lambda scope, receive, send: None)
    monkeypatch.setattr(middleware, "_redis_url", None)

    first = asyncio.run(middleware._increment_count(("tenant-1", "2026-06-29"), "2026-06-29"))
    second = asyncio.run(middleware._increment_count(("tenant-1", "2026-06-29"), "2026-06-29"))

    assert first == 1
    assert second == 2


def test_rate_limit_dispatch_returns_429_after_plan_limit(monkeypatch):
    from starlette.requests import Request
    from starlette.responses import Response

    from db import queries
    from middleware import rate_limit
    from middleware.rate_limit import TenantPlanRateLimitMiddleware

    async def fake_get_tenant_by_id(tenant_id):
        assert tenant_id == "tenant-1"
        return {"id": "tenant-1", "plan": "free"}

    async def call_next(_request):
        return Response(status_code=204)

    def make_request():
        return Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/scrape/test",
                "headers": [
                    (b"x-tenant-id", b"tenant-1"),
                    (b"authorization", b"Bearer valid-token"),
                ],
                "query_string": b"",
                "server": ("testserver", 80),
                "scheme": "http",
            }
        )

    monkeypatch.setattr(rate_limit, "PLAN_LIMITS", {**rate_limit.PLAN_LIMITS, "free": 1})
    monkeypatch.setattr(queries, "get_tenant_by_id", fake_get_tenant_by_id)
    middleware = TenantPlanRateLimitMiddleware(lambda scope, receive, send: None)
    monkeypatch.setattr(middleware, "_redis_url", None)

    first = asyncio.run(middleware.dispatch(make_request(), call_next))
    second = asyncio.run(middleware.dispatch(make_request(), call_next))

    assert first.status_code == 204
    assert second.status_code == 429
    assert second.body == b'{"detail":"Tageslimit f\xc3\xbcr diesen Plan erreicht"}'


def test_rate_limit_dispatch_ignores_non_scrape_routes(monkeypatch):
    from starlette.requests import Request
    from starlette.responses import Response

    from db import queries
    from middleware import rate_limit
    from middleware.rate_limit import TenantPlanRateLimitMiddleware

    async def fake_get_tenant_by_id(_tenant_id):
        raise AssertionError("non-scrape routes should not consume scrape plan quota")

    async def call_next(_request):
        return Response(status_code=204)

    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/products",
            "headers": [
                (b"x-tenant-id", b"tenant-1"),
                (b"authorization", b"Bearer valid-token"),
            ],
            "query_string": b"",
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )

    monkeypatch.setattr(rate_limit, "PLAN_LIMITS", {**rate_limit.PLAN_LIMITS, "free": 0})
    monkeypatch.setattr(queries, "get_tenant_by_id", fake_get_tenant_by_id)
    middleware = TenantPlanRateLimitMiddleware(lambda scope, receive, send: None)

    response = asyncio.run(middleware.dispatch(request, call_next))

    assert response.status_code == 204


def test_connector_secret_encryption_roundtrip(monkeypatch):
    from security.crypto import decrypt_secret, encrypt_secret

    monkeypatch.setenv("CONNECTOR_ENCRYPTION_KEY", "test-secret-for-connectors")
    token = "shpat_example_secret"
    encrypted = encrypt_secret(token)

    assert encrypted != token
    assert decrypt_secret(encrypted) == token


def test_browserless_ws_url_uses_token_and_existing_query(monkeypatch):
    from scrapers import stealth

    monkeypatch.setenv("BROWSERLESS_TOKEN", "token-123")
    monkeypatch.setattr(stealth, "BROWSERLESS_HOST", "wss://browserless.example?stealth=1")

    assert stealth.browserless_ws_url() == "wss://browserless.example?stealth=1&token=token-123"


def test_playwright_scraper_coerces_common_price_values():
    from scrapers.playwright_scraper import _coerce_price

    assert _coerce_price(12) == 12.0
    assert _coerce_price("1.299,50 EUR") == 1299.5
    assert _coerce_price("Preis: 89,90 inkl. MwSt.") == 89.9
    assert _coerce_price("kein preis") is None
    assert _coerce_price(None) is None


def test_scraper_agent_uses_deterministic_extraction_before_llm(monkeypatch):
    from agents import scraper_agent
    from agents.scraper_agent import ScraperAgent

    marker = object()

    async def fake_extract_price(page):
        assert page is marker
        return 89.95

    async def fail_llm(_self, _text):
        raise AssertionError("LLM fallback must not run when structured extraction succeeds")

    monkeypatch.setattr(scraper_agent, "extract_price", fake_extract_price)
    monkeypatch.setattr(ScraperAgent, "_extract_with_llm", fail_llm)

    result = asyncio.run(ScraperAgent()._extract_automatic(marker))

    assert result == {"price": 89.95, "currency": "EUR", "in_stock": None}


def test_scraper_agent_does_not_require_llm_for_automatic_scraping(monkeypatch):
    from agents import scraper_agent
    from agents.scraper_agent import ScraperAgent

    async def fake_extract_price(_page):
        return None

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(scraper_agent, "extract_price", fake_extract_price)

    try:
        asyncio.run(ScraperAgent()._extract_automatic(object()))
    except ValueError as exc:
        assert "No price found" in str(exc)
    else:
        raise AssertionError("missing deterministic price should fail clearly")


def test_playwright_extraction_continues_after_structured_data_errors():
    from scrapers.playwright_scraper import extract_price

    class FakeLocator:
        @property
        def first(self):
            return self

        async def inner_text(self, timeout):
            assert timeout == 3_000
            return "79,90 EUR"

    class FakePage:
        async def evaluate(self, _script):
            raise RuntimeError("broken JSON-LD runtime")

        async def get_attribute(self, _selector, _attribute):
            raise RuntimeError("metadata unavailable")

        def locator(self, _selector):
            return FakeLocator()

    assert asyncio.run(extract_price(FakePage())) == 79.9


def test_scrape_price_uses_browserless_context_and_meta_fallback(monkeypatch):
    from scrapers import playwright_scraper

    events = []

    class FakePage:
        async def goto(self, url, wait_until, timeout):
            events.append(("goto", url, wait_until, timeout))

        async def evaluate(self, script):
            assert "application/ld+json" in script
            events.append(("jsonld",))
            return None

        async def get_attribute(self, selector, attribute):
            events.append(("meta", selector, attribute))
            if selector == 'meta[property="og:price:amount"]':
                return "89,90"
            return None

    class FakeContext:
        def __init__(self):
            self.page = FakePage()

        async def new_page(self):
            events.append(("new_page",))
            return self.page

    class FakeBrowser:
        def __init__(self):
            self.context_payload = None
            self.closed = False

        async def new_context(self, **payload):
            self.context_payload = payload
            events.append(("context", payload))
            return FakeContext()

        async def close(self):
            self.closed = True
            events.append(("close",))

    fake_browser = FakeBrowser()

    class FakeChromium:
        async def connect_over_cdp(self, ws_url):
            events.append(("connect", ws_url))
            return fake_browser

    class FakePlaywright:
        chromium = FakeChromium()

    class FakePlaywrightContext:
        async def __aenter__(self):
            return FakePlaywright()

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setenv("BROWSERLESS_TOKEN", "token-123")
    monkeypatch.setattr(playwright_scraper, "async_playwright", lambda: FakePlaywrightContext())
    monkeypatch.setattr(playwright_scraper, "random_user_agent", lambda: "ua-test")

    price = asyncio.run(playwright_scraper.scrape_price("https://shop.example/product"))

    assert price == 89.9
    assert ("connect", "wss://production-sfo.browserless.io?token=token-123") in events
    assert fake_browser.context_payload == {
        "user_agent": "ua-test",
        "extra_http_headers": playwright_scraper.STEALTH_HEADERS,
        "locale": "de-DE",
        "timezone_id": "Europe/Berlin",
        "viewport": {"width": 1366, "height": 768},
    }
    assert ("goto", "https://shop.example/product", "domcontentloaded", 30_000) in events
    assert ("close",) in events


def test_scrape_price_uses_css_fallback_and_closes_on_missing_price(monkeypatch):
    from scrapers import playwright_scraper

    events = []

    class FakeFirstLocator:
        def __init__(self, selector):
            self.selector = selector

        async def inner_text(self, timeout):
            events.append(("css", self.selector, timeout))
            if self.selector == ".product-price":
                return "129,99 EUR"
            raise RuntimeError("not found")

    class FakeLocator:
        def __init__(self, selector):
            self.selector = selector
            self.first = FakeFirstLocator(selector)

    class FakePage:
        async def goto(self, *_args, **_kwargs):
            return None

        async def evaluate(self, _script):
            return None

        async def get_attribute(self, _selector, _attribute):
            return None

        def locator(self, selector):
            return FakeLocator(selector)

    class FakeContext:
        async def new_page(self):
            return FakePage()

    class FakeBrowser:
        async def new_context(self, **_payload):
            return FakeContext()

        async def close(self):
            events.append(("close",))

    class FakeChromium:
        async def connect_over_cdp(self, _ws_url):
            return FakeBrowser()

    class FakePlaywright:
        chromium = FakeChromium()

    class FakePlaywrightContext:
        async def __aenter__(self):
            return FakePlaywright()

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setenv("BROWSERLESS_TOKEN", "token-123")
    monkeypatch.setattr(playwright_scraper, "async_playwright", lambda: FakePlaywrightContext())

    price = asyncio.run(playwright_scraper.scrape_price("https://shop.example/product"))

    assert price == 129.99
    assert ("css", ".price--main", 3_000) in events
    assert ("css", ".product-price", 3_000) in events
    assert ("close",) in events


def test_billing_checkout_creates_viva_order(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from routers import billing

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "free", "_email": "owner@example.com"}

    calls = []

    async def fake_create_payment_order(**payload):
        calls.append(payload)
        return 1234567890123456

    async def fake_create_billing_order(payload):
        calls.append(payload)
        return payload

    monkeypatch.setattr(billing.viva, "create_payment_order", fake_create_payment_order)
    monkeypatch.setattr(billing.queries, "create_billing_order", fake_create_billing_order)
    monkeypatch.setattr(billing.viva, "checkout_url", lambda code: f"https://viva.example/{code}")
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/billing/checkout", json={"plan": "pro"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"url": "https://viva.example/1234567890123456"}
    assert calls == [
        {"tenant_id": "tenant-1", "email": "owner@example.com", "plan": "pro"},
            {"tenant_id": "tenant-1", "order_code": 1234567890123456, "plan": "pro", "amount_cents": 3451},
    ]


def test_billing_checkout_requires_owner_role(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency", "_role": "member"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/billing/checkout", json={"plan": "pro"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Nur Owner dürfen diese Aktion ausführen"


def test_billing_cancel_requires_active_viva_subscription(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "pro", "billing_provider": None}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/billing/cancel")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["detail"] == "Kein aktives Viva-Abonnement vorhanden"


def test_billing_checkout_requires_viva_configuration(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "free"}

    from routers import billing

    async def missing_config(**_payload):
        raise billing.viva.VivaConfigurationError("missing")

    monkeypatch.setattr(billing.viva, "create_payment_order", missing_config)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/billing/checkout", json={"plan": "pro"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"] == "Viva ist nicht vollständig konfiguriert"


def test_billing_cancel_updates_subscription(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from routers import billing

    async def fake_current_tenant():
        return {
            "id": "tenant-1",
            "plan": "pro",
            "billing_provider": "viva",
            "subscription_status": "active",
            "subscription_current_period_end": "2026-08-01T00:00:00+00:00",
        }

    updates = []
    async def fake_update_tenant(tenant_id, values):
        updates.append((tenant_id, values))
        return values
    monkeypatch.setattr(billing.queries, "update_tenant", fake_update_tenant)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/billing/cancel")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"canceled": True}
    assert updates == [
        (
            "tenant-1",
            {
                "subscription_cancel_at_period_end": True,
                "cancellation_effective_at": "2026-08-01T00:00:00+00:00",
                "billing_status_metadata": {"cancel_requested": True},
            },
        )
    ]


def test_viva_webhook_verifies_payment_and_activates_plan(monkeypatch):
    from db import queries
    from webhooks import viva_handler

    class FakeRequest:
        async def json(self):
            return {
                "EventTypeId": 1796,
                "EventData": {
                    "TransactionId": "997ab1e3-e6ce-45c9-970d-4d902f27ce71",
                    "OrderCode": 2271655739472609,
                    "SourceCode": "1234",
                },
            }

    async def fake_get_order(_code):
        return {"id": "order-1", "tenant_id": "tenant-1", "order_code": 2271655739472609, "plan": "pro", "amount_cents": 3451, "status": "pending"}

    async def fake_retrieve(_transaction_id):
        return {"orderCode": 2271655739472609, "statusId": "F", "amount": 34.51, "sourceCode": "1234"}

    async def fake_get_tenant(tenant_id):
        return {"id": tenant_id, "shop_name": "Shop"}

    async def fake_invoice(**values):
        assert values["plan"] == "pro"
        return {"id": "invoice-1"}

    updates = []
    async def fake_update_order(code, values):
        updates.append(("order", code, values))
        return values
    async def fake_update_tenant(tenant_id, values):
        updates.append(("tenant", tenant_id, values))
        return values

    monkeypatch.setattr(queries, "get_billing_order", fake_get_order)
    monkeypatch.setattr(queries, "update_billing_order", fake_update_order)
    monkeypatch.setattr(queries, "update_tenant", fake_update_tenant)
    monkeypatch.setattr(queries, "get_tenant_by_id", fake_get_tenant)
    monkeypatch.setattr(viva_handler.viva, "retrieve_transaction", fake_retrieve)
    monkeypatch.setattr(viva_handler, "create_paid_invoice", fake_invoice)

    result = asyncio.run(viva_handler.handle_viva_webhook(FakeRequest()))

    assert result == {"ok": True}
    assert updates[0][0:2] == ("order", 2271655739472609)
    assert updates[1][0:2] == ("tenant", "tenant-1")
    assert updates[1][2]["plan"] == "pro"
    assert updates[1][2]["billing_provider"] == "viva"
    assert updates[1][2]["subscription_status"] == "active"


def test_viva_webhook_ignores_unrelated_order(monkeypatch):
    from db import queries
    from webhooks import viva_handler

    class FakeRequest:
        async def json(self):
            return {"EventTypeId": 1796, "EventData": {"TransactionId": "tx", "OrderCode": 7}}

    async def fake_get_order(_code):
        return None

    monkeypatch.setattr(queries, "get_billing_order", fake_get_order)
    assert asyncio.run(viva_handler.handle_viva_webhook(FakeRequest())) == {"ok": True}


def test_viva_webhook_rejects_invalid_payload():
    from webhooks import viva_handler

    class FakeRequest:
        async def json(self):
            raise ValueError("bad json")

    try:
        asyncio.run(viva_handler.handle_viva_webhook(FakeRequest()))
    except Exception as exc:
        assert exc.status_code == 400
        assert exc.detail == "Ungültiger Payload"
    else:
        raise AssertionError("invalid webhook payload should fail")


def test_viva_webhook_rejects_unverified_amount(monkeypatch):
    from db import queries
    from webhooks import viva_handler

    class FakeRequest:
        async def json(self):
            return {"EventTypeId": 1796, "EventData": {"TransactionId": "tx", "OrderCode": 7}}

    async def fake_get_order(_code):
        return {"tenant_id": "tenant-1", "order_code": 7, "plan": "pro", "amount_cents": 2900, "status": "pending"}
    async def fake_retrieve(_transaction_id):
        return {"orderCode": 7, "statusId": "F", "amount": 1.0}

    monkeypatch.setattr(queries, "get_billing_order", fake_get_order)
    monkeypatch.setattr(viva_handler.viva, "retrieve_transaction", fake_retrieve)
    try:
        asyncio.run(viva_handler.handle_viva_webhook(FakeRequest()))
    except Exception as exc:
        assert exc.status_code == 400
        assert exc.detail == "Viva-Zahlung konnte nicht bestätigt werden"
    else:
        raise AssertionError("mismatched amount should fail")


def test_viva_webhook_key_proxies_provider_key(monkeypatch):
    from webhooks import viva_handler

    async def fake_key():
        return {"Key": "verification"}

    monkeypatch.setattr(viva_handler.viva, "webhook_verification_key", fake_key)
    assert asyncio.run(viva_handler.viva_webhook_key()) == {"Key": "verification"}


def test_viva_webhook_key_maps_provider_errors(monkeypatch):
    from webhooks import viva_handler

    for error, status in (
        (viva_handler.viva.VivaConfigurationError("missing"), 503),
        (viva_handler.viva.VivaAPIError("down"), 502),
    ):
        async def fail(error=error):
            raise error

        monkeypatch.setattr(viva_handler.viva, "webhook_verification_key", fail)
        try:
            asyncio.run(viva_handler.viva_webhook_key())
        except Exception as exc:
            assert exc.status_code == status
        else:
            raise AssertionError("provider error should be mapped")


def test_viva_webhook_validates_event_shape():
    from webhooks import viva_handler

    class FakeRequest:
        def __init__(self, payload):
            self.payload = payload

        async def json(self):
            return self.payload

    cases = [
        ([], 400),
        ({"EventTypeId": 42}, 200),
        ({"EventTypeId": 1796, "EventData": None}, 400),
        ({"EventTypeId": 1796, "EventData": {}}, 400),
    ]
    for payload, expected_status in cases:
        try:
            result = asyncio.run(viva_handler.handle_viva_webhook(FakeRequest(payload)))
        except Exception as exc:
            assert exc.status_code == expected_status
        else:
            assert expected_status == 200
            assert result == {"ok": True}


def test_viva_webhook_is_idempotent_for_paid_order(monkeypatch):
    from db import queries
    from webhooks import viva_handler

    class FakeRequest:
        async def json(self):
            return {"EventTypeId": 1796, "EventData": {"TransactionId": "tx", "OrderCode": 7}}

    async def fake_get_order(_code):
        return {"order_code": 7, "status": "paid"}

    monkeypatch.setattr(queries, "get_billing_order", fake_get_order)
    assert asyncio.run(viva_handler.handle_viva_webhook(FakeRequest())) == {"ok": True}


def test_viva_webhook_maps_transaction_verification_errors(monkeypatch):
    from db import queries
    from webhooks import viva_handler

    class FakeRequest:
        async def json(self):
            return {"EventTypeId": 1796, "EventData": {"TransactionId": "tx", "OrderCode": 7}}

    async def fake_get_order(_code):
        return {"order_code": 7, "status": "pending"}

    monkeypatch.setattr(queries, "get_billing_order", fake_get_order)
    for error, status in (
        (viva_handler.viva.VivaConfigurationError("missing"), 503),
        (viva_handler.viva.VivaAPIError("down"), 502),
    ):
        async def fail(_transaction_id, error=error):
            raise error

        monkeypatch.setattr(viva_handler.viva, "retrieve_transaction", fail)
        try:
            asyncio.run(viva_handler.handle_viva_webhook(FakeRequest()))
        except Exception as exc:
            assert exc.status_code == status
        else:
            raise AssertionError("verification error should be mapped")


def test_billing_migration_preserves_starter_as_pro():
    migration = (ROOT / "db" / "migrations" / "versions" / "0002_billing.py").read_text()

    assert "update public.tenants set plan = 'pro' where plan = 'starter';" in migration
    assert "where plan in ('trial', 'starter')" not in migration


def test_api_key_hash_is_not_select_granted_to_authenticated():
    migration = (ROOT / "db" / "migrations" / "versions" / "0004_api_keys.py").read_text()
    schema = (ROOT / "db" / "schema.sql").read_text()

    assert "grant select (id, tenant_id, name, created_at, last_used, revoked)" in migration
    assert "grant select, insert, update, delete on public.api_keys" not in schema


def test_worker_settings_registers_required_tasks():
    from jobs.worker import WorkerSettings

    function_names = {function.__name__ for function in WorkerSettings.functions}
    assert {"scrape_target", "scrape_product", "scrape_all", "send_to_dlq", "send_email", "deliver_alert"} <= function_names
    assert WorkerSettings.on_startup is not None
    assert WorkerSettings.on_shutdown is not None
    assert WorkerSettings.max_tries == 3


def test_worker_autoscaling_signals_report_queue_pressure():
    from jobs.worker_status import worker_autoscaling_signals

    class FakeRedis:
        async def zcard(self, queue_name):
            assert queue_name == "arq:queue"
            return 25

    result = asyncio.run(worker_autoscaling_signals(FakeRedis(), max_jobs=10))

    assert result == {
        "queue": "arq:queue",
        "queued_jobs": 25,
        "max_jobs": 10,
        "queue_saturation": 2.5,
        "scale_hint": "scale_out",
    }


def test_worker_health_endpoint_reports_queue_signals_and_closes_redis(monkeypatch):
    import main

    class FakeRedis:
        closed = False

        async def zcard(self, queue_name):
            assert queue_name == "arq:queue"
            return 3

        async def aclose(self):
            self.closed = True

    redis = FakeRedis()

    async def fake_create_pool(redis_settings):
        assert redis_settings.host == "localhost"
        return redis

    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379")
    monkeypatch.setenv("ARQ_MAX_JOBS", "6")
    monkeypatch.setattr(main, "create_pool", fake_create_pool)

    response = TestClient(main.app).get("/health/worker")

    assert response.status_code == 200
    assert response.json() == {
        "queue": "arq:queue",
        "queued_jobs": 3,
        "max_jobs": 6,
        "queue_saturation": 0.5,
        "scale_hint": "steady",
    }
    assert redis.closed is True


def test_worker_health_endpoint_requires_redis_url(monkeypatch):
    import main

    monkeypatch.delenv("REDIS_URL", raising=False)

    response = TestClient(main.app).get("/health/worker")

    assert response.status_code == 503
    assert response.json()["detail"] == "REDIS_URL ist nicht konfiguriert"


def test_scrape_target_missing_mapping_sends_to_dlq(monkeypatch):
    from db import queries
    from jobs import scrape_tasks

    async def fake_get_scrape_targets(tenant_id, competitor_product_ids=None):
        assert tenant_id == "tenant-1"
        assert competitor_product_ids == ["mapping-1"]
        return []

    dlq_calls = []

    async def fake_maybe_retry_or_dlq(ctx, **kwargs):
        dlq_calls.append((ctx, kwargs))

    monkeypatch.setattr(queries, "get_scrape_targets", fake_get_scrape_targets)
    monkeypatch.setattr(scrape_tasks, "maybe_retry_or_dlq", fake_maybe_retry_or_dlq)

    result = asyncio.run(
        scrape_tasks.scrape_target(
            {"job_try": 3}, competitor_product_id="mapping-1", tenant_id="tenant-1"
        )
    )

    assert result == {"scrape_ok": False, "error": "Aktive Preisquelle nicht gefunden"}
    assert dlq_calls[0][1] == {
        "tenant_id": "tenant-1",
        "competitor_product_id": "mapping-1",
        "error": "Aktive Preisquelle nicht gefunden",
    }


def test_scrape_target_returns_serialized_success(monkeypatch):
    from datetime import datetime, timezone

    from agents.scraper_agent import ScrapeResult
    from db import queries
    from jobs import scrape_tasks

    async def fake_get_scrape_targets(_tenant_id, _competitor_product_ids=None):
        return [
            {
                "competitor_product_id": "mapping-1",
                "url": "https://shop.example/product",
                "selector_price": ".price",
                "selector_stock": ".stock",
                "tenant_id": "tenant-1",
                "competitor_id": "competitor-1",
            }
        ]

    class FakeScraperAgent:
        async def scrape(self, target):
            assert target.competitor_product_id == "mapping-1"
            return ScrapeResult(
                competitor_product_id="mapping-1",
                price=99.99,
                currency="EUR",
                in_stock=True,
                raw_price_text="99,99 EUR",
                scrape_ok=True,
                error_msg=None,
                scraped_at=datetime(2026, 6, 30, tzinfo=timezone.utc),
            )

    retry_calls = []
    alert_calls = []

    async def fake_maybe_retry_or_dlq(ctx, **kwargs):
        retry_calls.append((ctx, kwargs))

    class FakeAlertAgent:
        async def run(self, tenant_id):
            alert_calls.append(tenant_id)
            return {"checked": 1, "triggered": 0}

    monkeypatch.setattr(queries, "get_scrape_targets", fake_get_scrape_targets)
    monkeypatch.setattr(scrape_tasks, "ScraperAgent", FakeScraperAgent)
    monkeypatch.setattr(scrape_tasks, "maybe_retry_or_dlq", fake_maybe_retry_or_dlq)
    monkeypatch.setattr(scrape_tasks, "AlertAgent", FakeAlertAgent)

    result = asyncio.run(
        scrape_tasks.scrape_target(
            {"job_try": 1}, competitor_product_id="mapping-1", tenant_id="tenant-1"
        )
    )

    assert result["scrape_ok"] is True
    assert result["price"] == 99.99
    assert retry_calls == []
    assert alert_calls == ["tenant-1"]


def test_scrape_target_retry_requires_an_additional_quota_slot(monkeypatch):
    from db import queries
    from jobs import scrape_tasks

    async def fake_targets(_tenant_id, _ids=None):
        return [
            {
                "competitor_product_id": "mapping-1",
                "url": "https://shop.example/product",
                "selector_price": ".price",
                "selector_stock": None,
                "tenant_id": "tenant-1",
                "competitor_id": "competitor-1",
            }
        ]

    async def fake_tenant(_tenant_id):
        return {"id": "tenant-1", "plan": "free"}

    async def fake_reserve(redis, *, tenant_id, plan, requested):
        assert redis is marker
        assert (tenant_id, plan, requested) == ("tenant-1", "free", 1)
        return 0

    class UnexpectedScraper:
        async def scrape(self, _target):
            raise AssertionError("quota-blocked retries must not scrape")

    marker = object()
    monkeypatch.setattr(queries, "get_scrape_targets", fake_targets)
    monkeypatch.setattr(queries, "get_tenant_by_id", fake_tenant)
    monkeypatch.setattr(scrape_tasks, "reserve_scrape_slots", fake_reserve)
    monkeypatch.setattr(scrape_tasks, "ScraperAgent", UnexpectedScraper)

    result = asyncio.run(
        scrape_tasks.scrape_target(
            {"job_try": 2, "redis": marker},
            competitor_product_id="mapping-1",
            tenant_id="tenant-1",
            quota_reserved=True,
        )
    )

    assert result == {"scrape_ok": False, "error": "Tageslimit für Preisabrufe erreicht"}


def test_scrape_product_fans_out_active_mappings_and_runs_alerts(monkeypatch):
    from db import queries
    from jobs import scrape_tasks

    async def fake_list_product_mappings(tenant_id, product_id):
        assert (tenant_id, product_id) == ("tenant-1", "product-1")
        return [{"id": "mapping-1", "active": True}, {"id": "mapping-2", "active": False}]

    scrape_calls = []

    async def fake_scrape_target(
        ctx,
        *,
        competitor_product_id,
        tenant_id,
        evaluate_alerts=True,
        quota_reserved=False,
    ):
        scrape_calls.append(
            (ctx, competitor_product_id, tenant_id, evaluate_alerts, quota_reserved)
        )
        return {"scrape_ok": True, "competitor_product_id": competitor_product_id}

    alert_calls = []

    class FakeAlertAgent:
        async def run(self, tenant_id):
            alert_calls.append(tenant_id)
            return {"checked": 1, "triggered": 0}

    monkeypatch.setattr(queries, "list_product_mappings", fake_list_product_mappings)
    monkeypatch.setattr(scrape_tasks, "scrape_target", fake_scrape_target)
    monkeypatch.setattr(scrape_tasks, "AlertAgent", FakeAlertAgent)

    result = asyncio.run(
        scrape_tasks.scrape_product({"job_try": 1}, product_id="product-1", tenant_id="tenant-1")
    )

    assert result == {
        "triggered": 1,
        "results": [{"scrape_ok": True, "competitor_product_id": "mapping-1"}],
    }
    assert scrape_calls == [({"job_try": 1}, "mapping-1", "tenant-1", False, False)]
    assert alert_calls == ["tenant-1"]


def test_scrape_all_enqueues_every_tenant_target(monkeypatch):
    from db import queries
    from jobs import scrape_tasks

    async def fake_list_tenants():
        return [
            {"id": "tenant-1", "plan": "free"},
            {"id": "tenant-2", "plan": "pro"},
        ]

    async def fake_get_scrape_targets(tenant_id):
        return [{"competitor_product_id": f"{tenant_id}-mapping"}]

    class FakeRedis:
        def __init__(self):
            self.jobs = []

        async def enqueue_job(self, *args, **kwargs):
            self.jobs.append((args, kwargs))
            if kwargs["tenant_id"] == "tenant-2":
                return None
            return {"job_id": "job-1"}

    redis = FakeRedis()

    async def fake_reserve(_redis, *, tenant_id, plan, requested):
        assert requested == 1
        assert plan == ("free" if tenant_id == "tenant-1" else "pro")
        return 1

    released = []

    async def fake_release(_redis, *, tenant_id, count):
        released.append((tenant_id, count))

    monkeypatch.setattr(queries, "list_tenants", fake_list_tenants)
    monkeypatch.setattr(queries, "get_scrape_targets", fake_get_scrape_targets)
    monkeypatch.setattr(scrape_tasks, "reserve_scrape_slots", fake_reserve)
    monkeypatch.setattr(scrape_tasks, "release_scrape_slots", fake_release)

    result = asyncio.run(scrape_tasks.scrape_all({"redis": redis}))

    assert result == {"queued": 1}
    assert redis.jobs == [
        (
            ("scrape_target",),
                {
                    "competitor_product_id": "tenant-1-mapping",
                    "tenant_id": "tenant-1",
                    "quota_reserved": True,
                    "_job_id": redis.jobs[0][1]["_job_id"],
                },
        ),
        (
            ("scrape_target",),
            {
                    "competitor_product_id": "tenant-2-mapping",
                    "tenant_id": "tenant-2",
                    "quota_reserved": True,
                    "_job_id": redis.jobs[1][1]["_job_id"],
                },
        ),
    ]
    assert released == [("tenant-1", 0), ("tenant-2", 1)]


def test_alert_percentage_conditions_match_delta_semantics():
    from agents.alert_agent import AlertAgent

    cheaper_row = {"delta_pct": -15, "competitor_price": 85, "our_price": 100}
    pricier_row = {"delta_pct": 20, "competitor_price": 120, "our_price": 100}

    assert AlertAgent.evaluate({"condition": "below_pct", "threshold": 10}, cheaper_row)
    assert not AlertAgent.evaluate({"condition": "below_pct", "threshold": 10}, pricier_row)
    assert AlertAgent.evaluate({"condition": "above_pct", "threshold": 10}, pricier_row)
    assert not AlertAgent.evaluate({"condition": "above_pct", "threshold": 10}, cheaper_row)

    stock_change = {"previous_in_stock": True, "in_stock": False}
    unchanged_stock = {"previous_in_stock": False, "in_stock": False}
    assert AlertAgent.evaluate({"condition": "out_of_stock"}, stock_change)
    assert not AlertAgent.evaluate({"condition": "out_of_stock"}, unchanged_stock)

    price_change = {"previous_competitor_price": 100, "competitor_price": 89}
    assert AlertAgent.evaluate(
        {"condition": "price_drop", "threshold": 10, "threshold_unit": "percent"},
        price_change,
    )
    assert AlertAgent.evaluate(
        {"condition": "price_drop", "threshold": 10, "threshold_unit": "absolute"},
        price_change,
    )
    assert AlertAgent.evaluate(
        {"condition": "source_broken", "threshold": 3},
        {"health_status": "broken", "consecutive_failures": 3},
    )


def test_daily_digest_is_german_and_formats_euro_values():
    from jobs.digest_tasks import _digest_text

    text = _digest_text(
        "Mein Shop",
        "2026-07-03",
        [
            {
                "trigger_reason": "price_drop",
                "competitor_price": 1234.5,
                "competitor_products": {
                    "products": {"name": "Lampe"},
                    "competitors": {"shop_name": "Markt"},
                },
            }
        ],
    )

    assert "PriceVault Tagesübersicht für Mein Shop" in text
    assert "Neue Ereignisse: 1" in text
    assert "1.234,50 €" in text
    assert "/dashboard/alerts" in text


def test_alert_channels_deliver_when_email_fails(monkeypatch):
    from agents.alert_agent import AlertAgent
    from db import queries

    async def fake_latest_prices(_tenant_id):
        return [
            {
                "competitor_product_id": "cp-1",
                "product_id": "product-1",
                "competitor_id": "competitor-1",
                "product_name": "Produkt",
                "competitor_shop": "Shop",
                "our_price": 100,
                "competitor_price": 80,
                "delta_pct": -20,
                "competitor_url": "https://example.com/product",
            }
        ]

    async def fake_alerts(_tenant_id, active_only=False):
        assert active_only
        return [
            {
                "id": "alert-1",
                "product_id": "product-1",
                "competitor_id": "competitor-1",
                "condition": "below_pct",
                "threshold": 10,
                "notify_email": "ops@example.com",
                "cooldown_h": 24,
                "last_triggered_at": None,
            }
        ]

    async def fake_snapshots(_tenant_id):
        return []

    events = []
    updates = []

    async def fake_insert_alert_event(values):
        events.append(values)
        return values

    async def fake_update_alert(tenant_id, alert_id, values):
        updates.append((tenant_id, alert_id, values))
        return values

    delivered = []

    async def fake_deliver_channels(self, tenant_id, row):
        delivered.append((tenant_id, row["competitor_product_id"]))

    async def fake_send_email(self, alert, row):
        raise RuntimeError("email down")

    monkeypatch.setattr(queries, "get_latest_prices", fake_latest_prices)
    monkeypatch.setattr(queries, "list_alerts", fake_alerts)
    monkeypatch.setattr(queries, "list_recent_snapshots", fake_snapshots)
    monkeypatch.setattr(queries, "insert_alert_event", fake_insert_alert_event)
    monkeypatch.setattr(queries, "update_alert", fake_update_alert)
    monkeypatch.setattr(AlertAgent, "_deliver_channels", fake_deliver_channels)
    monkeypatch.setattr(AlertAgent, "_send_email", fake_send_email)

    result = asyncio.run(AlertAgent().run("tenant-1"))

    assert result == {"checked": 1, "triggered": 1}
    assert delivered == [("tenant-1", "cp-1")]
    assert events[0]["email_sent"] is False
    assert updates[0][0:2] == ("tenant-1", "alert-1")


def test_alert_email_uses_configured_sender_and_app_url(monkeypatch):
    from agents.alert_agent import AlertAgent

    sent = []

    async def fake_to_thread(func, payload):
        sent.append(payload)
        return func(payload)

    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "PriceVault <alerts@pricevault.de>")
    monkeypatch.setenv("APP_URL", "https://preview.pricevault.de")
    monkeypatch.setattr("agents.alert_agent.asyncio.to_thread", fake_to_thread)
    monkeypatch.setattr("agents.alert_agent.resend.Emails.send", lambda payload: {"id": "email-1"})

    asyncio.run(
        AlertAgent()._send_email(
            {"notify_email": "kunde@example.com"},
            {
                "product_name": "Produkt",
                "competitor_shop": "Shop",
                "competitor_price": 79.9,
                "our_price": 99.9,
                "delta_pct": -20,
            },
        )
    )

    assert sent[0]["from"] == "PriceVault <alerts@pricevault.de>"
    assert sent[0]["to"] == ["kunde@example.com"]
    assert "https://preview.pricevault.de/dashboard" in sent[0]["text"]


def test_onboarding_sequence_schedules_three_email_jobs():
    from emails.sequence import schedule_onboarding_sequence

    class FakePool:
        def __init__(self):
            self.jobs = []

        async def enqueue_job(self, *args, **kwargs):
            self.jobs.append((args, kwargs))

    pool = FakePool()
    asyncio.run(schedule_onboarding_sequence("tenant-1", "kunde@example.com", pool))

    assert [job[0][0] for job in pool.jobs] == ["send_email", "send_email", "send_email"]
    assert [job[1]["template"] for job in pool.jobs] == [
        "onboarding_day0",
        "onboarding_day3",
        "onboarding_day7",
    ]
    assert [job[1]["tenant_id"] for job in pool.jobs] == ["tenant-1"] * 3


def test_onboarding_sequence_route_requires_redis(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "free", "_email": "kunde@example.com"}

    monkeypatch.delenv("REDIS_URL", raising=False)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/onboarding/sequence", json={"email": "kunde@example.com"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"] == "REDIS_URL ist nicht konfiguriert"


def test_onboarding_sequence_route_schedules_jobs_and_closes_pool(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant
    from routers import onboarding

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "free", "_email": "kunde@example.com"}

    class FakePool:
        def __init__(self):
            self.jobs = []
            self.closed = False

        async def enqueue_job(self, *args, **kwargs):
            self.jobs.append((args, kwargs))

        async def aclose(self):
            self.closed = True

    pool = FakePool()

    async def fake_create_pool(redis_settings):
        assert redis_settings.host == "localhost"
        return pool

    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379")
    monkeypatch.setattr(onboarding, "create_pool", fake_create_pool)
    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        client = TestClient(main.app)
        response = client.post("/onboarding/sequence", json={"email": "kunde@example.com"})
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"scheduled": True}
    assert [job[1]["template"] for job in pool.jobs] == [
        "onboarding_day0",
        "onboarding_day3",
        "onboarding_day7",
    ]
    assert [job[1]["tenant_id"] for job in pool.jobs] == ["tenant-1"] * 3
    assert pool.closed is True


def test_onboarding_sequence_rejects_a_different_recipient():
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "free", "_email": "owner@example.com"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        response = TestClient(main.app).post(
            "/onboarding/sequence", json={"email": "other@example.com"}
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Onboarding-E-Mails dürfen nur an deine eigene Adresse gesendet werden"
    )


def test_shopify_next_page_parser():
    from scrapers.shopify_catalog import _next_page_url

    link = '<https://example.myshopify.com/admin/api/products.json?page_info=abc>; rel="next"'
    assert _next_page_url(link, "example.myshopify.com") == (
        "https://example.myshopify.com/admin/api/products.json?page_info=abc"
    )
    assert _next_page_url(link, "other.myshopify.com") is None
    assert _next_page_url("", "example.myshopify.com") is None


def test_alert_delivery_posts_webhook_payload(monkeypatch):
    from jobs import alert_tasks

    posts = []

    class FakeResponse:
        @staticmethod
        def raise_for_status():
            return None

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, json, timeout):
            posts.append((url, json, timeout))
            return FakeResponse()

    monkeypatch.setattr(alert_tasks.httpx, "AsyncClient", FakeAsyncClient)
    payload = {"product_name": "Produkt", "new_price": 99}

    result = asyncio.run(
        alert_tasks.deliver_alert(
            {},
            channel={"type": "webhook", "config": {"url": "https://hooks.example/test"}},
            payload=payload,
        )
    )

    assert result == {"delivered": True}
    assert posts == [("https://hooks.example/test", payload, 10)]


def test_alert_delivery_decrypts_stored_webhook_url(monkeypatch):
    from jobs import alert_tasks
    from security.crypto import encrypt_secret

    posts = []

    class FakeResponse:
        @staticmethod
        def raise_for_status():
            return None

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, json, timeout):
            posts.append((url, json, timeout))
            return FakeResponse()

    monkeypatch.setenv("CONNECTOR_ENCRYPTION_KEY", "test-secret-for-connectors")
    monkeypatch.setattr(alert_tasks.httpx, "AsyncClient", FakeAsyncClient)
    payload = {"product_name": "Produkt", "new_price": 99}
    encrypted_url = encrypt_secret("https://hooks.example/encrypted")

    result = asyncio.run(
        alert_tasks.deliver_alert(
            {},
            channel={"type": "webhook", "config": {"url_ciphertext": encrypted_url}},
            payload=payload,
        )
    )

    assert result == {"delivered": True}
    assert posts == [("https://hooks.example/encrypted", payload, 10)]


def test_alert_delivery_posts_slack_message(monkeypatch):
    from jobs import alert_tasks

    posts = []

    class FakeResponse:
        @staticmethod
        def raise_for_status():
            return None

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, json, timeout):
            posts.append((url, json, timeout))
            return FakeResponse()

    monkeypatch.setattr(alert_tasks.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(
        alert_tasks.deliver_alert(
            {},
            channel={
                "type": "slack",
                "config": {"webhook_url": "https://hooks.slack.com/services/test"},
            },
            payload={
                "product_name": "Produkt",
                "old_price": 129.9,
                "new_price": 99.9,
                "delta_pct": -23.1,
                "product_url": "https://shop.example/produkt",
            },
        )
    )

    assert result == {"delivered": True}
    assert posts[0][0] == "https://hooks.slack.com/services/test"
    assert posts[0][2] == 10
    assert "*Produkt* Preisänderung" in posts[0][1]["text"]
    assert "99.90 EUR" in posts[0][1]["text"]
    assert "https://shop.example/produkt" in posts[0][1]["text"]


def test_alert_delivery_revalidates_stored_webhook_url(monkeypatch):
    from jobs import alert_tasks

    class FakeAsyncClient:
        async def __aenter__(self):
            raise AssertionError("unsafe stored channels must not be posted")

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setattr(alert_tasks.httpx, "AsyncClient", FakeAsyncClient)

    try:
        asyncio.run(
            alert_tasks.deliver_alert(
                {},
                channel={"type": "webhook", "config": {"url": "http://127.0.0.1/internal"}},
                payload={"product_name": "Produkt"},
            )
        )
    except ValueError as exc:
        assert str(exc) == "Private Webhook-Ziele sind nicht erlaubt"
    else:
        raise AssertionError("unsafe stored webhook URL should fail before delivery")


def test_send_to_dlq_records_failure_and_sends_ops_email(monkeypatch):
    from db import queries
    from jobs import retry

    failures = []

    async def fake_insert_scrape_failure(values):
        failures.append(values)
        return values

    sent = []

    async def fake_to_thread(func, payload):
        sent.append(payload)
        return func(payload)

    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "PriceVault <alerts@pricevault.de>")
    monkeypatch.setattr(queries, "insert_scrape_failure", fake_insert_scrape_failure)
    monkeypatch.setattr(retry.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(retry.resend.Emails, "send", lambda payload: {"id": "email-1"})

    result = asyncio.run(
        retry.send_to_dlq(
            {},
            product_id="product-1",
            competitor_product_id="mapping-1",
            tenant_id="tenant-1",
            error="broken" * 500,
            attempts=3,
        )
    )

    assert result == {"queued": True}
    assert failures[0]["tenant_id"] == "tenant-1"
    assert failures[0]["product_id"] == "product-1"
    assert failures[0]["competitor_product_id"] == "mapping-1"
    assert len(failures[0]["error"]) == 2000
    assert sent[0]["from"] == "PriceVault <alerts@pricevault.de>"
    assert sent[0]["subject"] == "[DLQ] Scrape failed after 3 attempts"
    assert sent[0]["to"] == ["ops@pricevault.de"]


def test_send_to_dlq_keeps_record_when_ops_email_fails(monkeypatch):
    from db import queries
    from jobs import retry

    failures = []

    async def fake_insert_scrape_failure(values):
        failures.append(values)
        return values

    async def fake_to_thread(func, payload):
        return func(payload)

    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setattr(queries, "insert_scrape_failure", fake_insert_scrape_failure)
    monkeypatch.setattr(retry.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(
        retry.resend.Emails,
        "send",
        lambda _payload: (_ for _ in ()).throw(RuntimeError("domain not verified")),
    )

    result = asyncio.run(
        retry.send_to_dlq(
            {},
            competitor_product_id="mapping-1",
            tenant_id="tenant-1",
            error="broken",
            attempts=3,
        )
    )

    assert result == {"queued": True}
    assert failures[0]["competitor_product_id"] == "mapping-1"


def test_maybe_retry_or_dlq_uses_exponential_backoff_before_max_attempts(monkeypatch):
    from arq import Retry
    from jobs import retry

    async def fake_send_to_dlq(*_args, **_kwargs):
        raise AssertionError("DLQ should not be used before max attempts")

    monkeypatch.setattr(retry, "MAX_ATTEMPTS", 3)
    monkeypatch.setattr(retry, "send_to_dlq", fake_send_to_dlq)

    try:
        asyncio.run(
            retry.maybe_retry_or_dlq(
                {"job_try": 2},
                tenant_id="tenant-1",
                competitor_product_id="mapping-1",
                error="temporary failure",
            )
        )
    except Retry as exc:
        assert exc.defer_score == 10_000
    else:
        raise AssertionError("retry helper should raise before max attempts")


def test_retry_delay_is_exponential_and_capped(monkeypatch):
    from jobs import retry

    monkeypatch.setattr(retry, "RETRY_BASE_SECONDS", 5)
    monkeypatch.setattr(retry, "RETRY_MAX_SECONDS", 20)

    assert [retry.retry_delay(attempt) for attempt in range(1, 6)] == [5, 10, 20, 20, 20]


def test_maybe_retry_or_dlq_sends_after_max_attempts(monkeypatch):
    from jobs import retry

    calls = []

    async def fake_send_to_dlq(ctx, **kwargs):
        calls.append((ctx, kwargs))
        return {"queued": True}

    monkeypatch.setattr(retry, "MAX_ATTEMPTS", 3)
    monkeypatch.setattr(retry, "send_to_dlq", fake_send_to_dlq)

    asyncio.run(
        retry.maybe_retry_or_dlq(
            {"job_try": 3},
            tenant_id="tenant-1",
            product_id="product-1",
            competitor_product_id="mapping-1",
            error="permanent failure",
        )
    )

    assert calls == [
        (
            {"job_try": 3},
            {
                "product_id": "product-1",
                "competitor_product_id": "mapping-1",
                "tenant_id": "tenant-1",
                "error": "permanent failure",
                "attempts": 3,
            },
        )
    ]


def test_send_email_uses_template_subject_and_resend(monkeypatch):
    from jobs import email_tasks

    sent = []

    async def fake_to_thread(func, payload):
        sent.append(payload)
        return func(payload)

    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "PriceVault <onboarding@pricevault.de>")
    monkeypatch.setenv("APP_URL", "https://preview.pricevault.de")
    monkeypatch.setattr(email_tasks.asyncio, "to_thread", fake_to_thread)
    monkeypatch.setattr(email_tasks.resend.Emails, "send", lambda payload: {"id": "email-1"})

    result = asyncio.run(
        email_tasks.send_email(
            {}, tenant_id="tenant-1", to="kunde@example.com", template="onboarding_day3"
        )
    )

    assert result == {"sent": "kunde@example.com"}
    assert sent[0]["from"] == "PriceVault <onboarding@pricevault.de>"
    assert sent[0]["to"] == ["kunde@example.com"]
    assert sent[0]["subject"] == "Dein erster Mitbewerber-Check"
    assert "Mitbewerber prüfen" in sent[0]["html"]
    assert "https://preview.pricevault.de/dashboard/competitors" in sent[0]["html"]


def test_shopify_catalog_fetches_products_across_pages(monkeypatch):
    from scrapers import shopify_catalog

    requests = []

    class FakeResponse:
        def __init__(self, payload, headers=None):
            self._payload = payload
            self.headers = headers or {}

        @staticmethod
        def raise_for_status():
            return None

        def json(self):
            return self._payload

    responses = [
        FakeResponse(
            {
                "products": [
                    {
                        "id": 1,
                        "title": "Produkt 1",
                        "handle": "produkt-1",
                        "variants": [{"id": 11, "title": "Standard", "price": "10.50", "sku": "SKU-1", "barcode": "4006381333931"}],
                    }
                ]
            },
            {
                "Link": '<https://shop.myshopify.com/admin/api/2024-04/products.json?page_info=next>; rel="next"'
            },
        ),
        FakeResponse(
            {
                "products": [
                    {
                        "id": 2,
                        "title": "Produkt 2",
                        "handle": "produkt-2",
                        "variants": [{"id": 22, "title": "Standard", "price": "20.00", "sku": ""}],
                    }
                ]
            }
        ),
    ]

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, url, headers, timeout):
            requests.append((url, headers, timeout))
            return responses.pop(0)

    monkeypatch.setattr(shopify_catalog.httpx, "AsyncClient", FakeAsyncClient)

    products = asyncio.run(
        _collect_async(
            shopify_catalog.fetch_shopify_products(
                "https://shop.myshopify.com/", "shpat_token"
            )
        )
    )

    assert [product["title"] for product in products] == ["Produkt 1", "Produkt 2"]
    assert products[0]["url"] == "https://shop.myshopify.com/products/produkt-1"
    assert products[0]["variants"] == [{"id": "11", "title": "Standard", "price": 10.5, "sku": "SKU-1", "gtin": "4006381333931"}]
    assert products[1]["variants"] == [{"id": "22", "title": "Standard", "price": 20.0, "sku": None, "gtin": None}]
    assert requests[0] == (
        "https://shop.myshopify.com/admin/api/2024-04/products.json?limit=250",
        {"X-Shopify-Access-Token": "shpat_token"},
        30,
    )


def test_shopify_catalog_does_not_forward_token_cross_host(monkeypatch):
    from scrapers import shopify_catalog

    class FakeResponse:
        headers = {
            "Link": '<https://attacker.example/steal?page_info=next>; rel="next"'
        }

        @staticmethod
        def raise_for_status():
            return None

        @staticmethod
        def json():
            return {"products": []}

    requests = []

    class FakeAsyncClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, url, headers, timeout):
            requests.append((url, headers, timeout))
            return FakeResponse()

    monkeypatch.setattr(shopify_catalog.httpx, "AsyncClient", FakeAsyncClient)

    products = asyncio.run(
        _collect_async(
            shopify_catalog.fetch_shopify_products(
                "shop.myshopify.com", "shpat_sensitive"
            )
        )
    )

    assert products == []
    assert len(requests) == 1


def test_competitor_routes_are_tenant_scoped(monkeypatch):
    import main
    from db import queries
    from routers import get_tenant

    async def fake_tenant():
        yield "tenant-1"

    async def fake_list(tenant_id):
        assert tenant_id == "tenant-1"
        return [{"id": "competitor-1", "shop_name": "Shop"}]

    async def fake_create(tenant_id, values):
        assert tenant_id == "tenant-1"
        assert values["base_url"] == "https://shop.example/"
        return {"id": "competitor-1", **values}

    async def fake_count(tenant_id):
        assert tenant_id == "tenant-1"
        return 0

    async def fake_get(tenant_id, competitor_id):
        assert tenant_id == "tenant-1"
        if competitor_id == "competitor-1":
            return {"id": competitor_id, "shop_name": "Shop"}
        return None

    async def fake_update(tenant_id, competitor_id, values):
        assert tenant_id == "tenant-1"
        if competitor_id == "competitor-1":
            return {"id": competitor_id, **values}
        return None

    async def fake_delete(tenant_id, competitor_id):
        assert tenant_id == "tenant-1"
        return competitor_id == "competitor-1"

    monkeypatch.setattr(queries, "list_competitors", fake_list)
    monkeypatch.setattr(queries, "create_competitor", fake_create)
    monkeypatch.setattr(queries, "count_active_competitors", fake_count)
    monkeypatch.setattr(queries, "get_competitor", fake_get)
    monkeypatch.setattr(queries, "update_competitor", fake_update)
    monkeypatch.setattr(queries, "soft_delete_competitor", fake_delete)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        listed = client.get("/competitors")
        created = client.post(
            "/competitors",
            json={"shop_name": "Shop", "base_url": "https://shop.example"},
        )
        fetched = client.get("/competitors/competitor-1")
        missing = client.get("/competitors/missing")
        updated = client.patch("/competitors/competitor-1", json={"scrape_freq_h": 12})
        invalid_update = client.patch("/competitors/competitor-1", json={"shop_name": ""})
        missing_update = client.patch("/competitors/missing", json={"active": False})
        deleted = client.delete("/competitors/competitor-1")
        missing_delete = client.delete("/competitors/missing")
    finally:
        main.app.dependency_overrides.clear()

    assert listed.json() == [{"id": "competitor-1", "shop_name": "Shop"}]
    assert created.status_code == 201
    assert fetched.status_code == 200
    assert missing.status_code == 404
    assert updated.json() == {"id": "competitor-1", "scrape_freq_h": 12}
    assert invalid_update.status_code == 422
    assert missing_update.status_code == 404
    assert deleted.status_code == 204
    assert missing_delete.status_code == 404


def test_snapshot_routes_use_tenant_and_bounded_history_window(monkeypatch):
    from datetime import datetime, timezone

    import main
    from db import queries
    from routers import get_tenant

    async def fake_tenant():
        yield "tenant-1"

    async def fake_latest(tenant_id):
        assert tenant_id == "tenant-1"
        return [{"competitor_product_id": "mapping-1", "price": 99.9}]

    async def fake_history(tenant_id, competitor_product_id, since):
        assert (tenant_id, competitor_product_id) == ("tenant-1", "mapping-1")
        age = datetime.now(timezone.utc) - datetime.fromisoformat(since)
        assert 6.99 < age.total_seconds() / 86400 < 7.01
        return [{"competitor_product_id": competitor_product_id, "price": 99.9}]

    monkeypatch.setattr(queries, "get_latest_prices", fake_latest)
    monkeypatch.setattr(queries, "get_snapshot_history", fake_history)
    main.app.dependency_overrides[get_tenant] = fake_tenant
    try:
        client = TestClient(main.app)
        latest = client.get("/snapshots/latest")
        history = client.get("/snapshots/history/mapping-1?days=7")
        invalid_days = client.get("/snapshots/history/mapping-1?days=366")
    finally:
        main.app.dependency_overrides.clear()

    assert latest.status_code == 200
    assert history.status_code == 200
    assert invalid_days.status_code == 422


def test_matcher_extracts_relative_and_google_redirect_links():
    from agents.matcher_agent import MatcherAgent

    class FakeAnchor:
        def __init__(self, href, title):
            self.href = href
            self.title = title

        async def get_attribute(self, name):
            assert name == "href"
            return self.href

        async def inner_text(self):
            return self.title

    class FakeAnchors:
        def __init__(self):
            self.values = [
                FakeAnchor("/produkte/lampe#details", "  Lampe   Pro  "),
                FakeAnchor(
                    "/url?q=https%3A%2F%2Fshop.example%2Fprodukte%2Flampe-2&sa=U",
                    "Lampe 2",
                ),
                FakeAnchor("https://other.example/lampe", "Fremder Shop"),
            ]

        async def count(self):
            return len(self.values)

        def nth(self, index):
            return self.values[index]

    class FakePage:
        @staticmethod
        def locator(selector):
            assert selector == "a[href]"
            return FakeAnchors()

    links = asyncio.run(MatcherAgent()._extract_links(FakePage(), "https://shop.example"))

    assert links == [
        ("https://shop.example/produkte/lampe", "Lampe Pro"),
        ("https://shop.example/produkte/lampe-2", "Lampe 2"),
    ]


def test_scraper_persistence_keeps_competitor_update_tenant_scoped(monkeypatch):
    from datetime import datetime, timezone

    from agents.scraper_agent import ScrapeResult, ScrapeTarget, ScraperAgent
    from db import queries

    result = ScrapeResult(
        competitor_product_id="mapping-1",
        price=99.9,
        currency="EUR",
        in_stock=True,
        raw_price_text="99,90 EUR",
        scrape_ok=True,
        error_msg=None,
        scraped_at=datetime(2026, 6, 30, 12, tzinfo=timezone.utc),
    )

    async def fake_scrape_page(self, target):
        return result

    snapshots = []
    competitor_updates = []

    async def fake_insert_snapshot(values):
        snapshots.append(values)
        return values

    async def fake_mark_competitor_scraped(tenant_id, competitor_id, scraped_at):
        competitor_updates.append((tenant_id, competitor_id, scraped_at))

    monkeypatch.setattr(ScraperAgent, "_scrape_page", fake_scrape_page)
    monkeypatch.setattr(queries, "insert_snapshot", fake_insert_snapshot)
    monkeypatch.setattr(queries, "mark_competitor_scraped", fake_mark_competitor_scraped)

    target = ScrapeTarget(
        competitor_product_id="mapping-1",
        url="https://shop.example/product",
        selector_price=".price",
        selector_stock=None,
        tenant_id="tenant-1",
        competitor_id="competitor-1",
    )
    persisted = asyncio.run(ScraperAgent().scrape(target))

    assert persisted == result
    assert snapshots[0]["tenant_id"] == "tenant-1"
    assert snapshots[0]["scraped_at"] == "2026-06-30T12:00:00+00:00"
    assert competitor_updates == [
        ("tenant-1", "competitor-1", "2026-06-30T12:00:00+00:00")
    ]


def test_scheduler_enqueues_targets_and_closes_pool(monkeypatch):
    from contextlib import contextmanager

    import scheduler
    from db import queries

    admin_contexts = []

    @contextmanager
    def fake_context(*, admin=False):
        admin_contexts.append(admin)
        yield

    async def fake_tenants():
        return [{"id": "tenant-1"}]

    async def fake_targets(tenant_id):
        assert tenant_id == "tenant-1"
        return [
            {"competitor_product_id": "mapping-1"},
            {"competitor_product_id": "mapping-2"},
        ]

    class FakeRedis:
        def __init__(self):
            self.jobs = []
            self.closed = False

        async def enqueue_job(self, *args, **kwargs):
            self.jobs.append((args, kwargs))
            return None if kwargs["competitor_product_id"] == "mapping-2" else object()

        async def aclose(self):
            self.closed = True

    redis = FakeRedis()

    async def fake_pool(settings):
        assert settings.host == "localhost"
        return redis

    monkeypatch.setattr(scheduler, "supabase_context", fake_context)
    monkeypatch.setattr(queries, "list_tenants", fake_tenants)
    monkeypatch.setattr(queries, "get_scrape_targets", fake_targets)
    monkeypatch.setattr(scheduler, "create_pool", fake_pool)

    queued = asyncio.run(scheduler.enqueue_all_scrapes("redis://localhost:6379"))

    assert queued == 1
    assert admin_contexts == [True]
    assert redis.closed is True
    assert redis.jobs[0] == (
        ("scrape_target",),
        {
            "competitor_product_id": "mapping-1",
            "tenant_id": "tenant-1",
            "quota_reserved": False,
        },
    )


def test_get_tenant_authorizes_rls_visible_team_members(monkeypatch):
    from starlette.requests import Request

    import routers

    filters = []

    class FakeAuth:
        @staticmethod
        def get_user(token):
            assert token == "valid-token"
            return type("Response", (), {"user": type("User", (), {"id": "member-1"})()})()

    class FakeQuery:
        def select(self, *_args):
            return self

        def eq(self, key, value):
            filters.append((key, value))
            return self

        def limit(self, *_args):
            return self

        def execute(self):
            return type("Response", (), {"data": [{"id": "tenant-1"}]})()

    class FakeClient:
        auth = FakeAuth()

        @staticmethod
        def table(name):
            assert name == "tenants"
            return FakeQuery()

    async def run_inline(function, /, *args, **kwargs):
        return function(*args, **kwargs)

    monkeypatch.setattr(routers, "get_supabase", lambda: FakeClient())
    monkeypatch.setattr(routers.asyncio, "to_thread", run_inline)
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": []})

    async def resolve():
        dependency = routers.get_tenant(
            request,
            authorization="Bearer valid-token",
            x_tenant_id="tenant-1",
        )
        tenant_id = await anext(dependency)
        await dependency.aclose()
        return tenant_id

    assert asyncio.run(resolve()) == "tenant-1"
    assert filters == [("id", "tenant-1")]
    assert request.state.user_id == "member-1"


def test_current_tenant_records_team_member_role(monkeypatch):
    from starlette.requests import Request

    from auth.dependencies import get_current_tenant
    from db import queries

    async def fake_tenant(tenant_id):
        assert tenant_id == "tenant-1"
        return {"id": tenant_id, "user_id": "owner-1", "plan": "agency"}

    async def fake_member(tenant_id, user_id):
        assert (tenant_id, user_id) == ("tenant-1", "member-1")
        return {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "role": "admin",
            "accepted": False,
        }

    accepted = []

    async def fake_accept(tenant_id, user_id):
        accepted.append((tenant_id, user_id))

    monkeypatch.setattr(queries, "get_tenant_by_id", fake_tenant)
    monkeypatch.setattr(queries, "get_team_member", fake_member)
    monkeypatch.setattr(queries, "accept_team_membership", fake_accept)
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": []})
    request.state.user_id = "member-1"

    tenant = asyncio.run(get_current_tenant(request, "tenant-1"))

    assert tenant["_role"] == "admin"
    assert accepted == [("tenant-1", "member-1")]


def test_regular_team_member_cannot_manage_seats(monkeypatch):
    import main
    from auth.dependencies import get_current_tenant

    async def fake_current_tenant():
        return {"id": "tenant-1", "plan": "agency", "_role": "member"}

    main.app.dependency_overrides[get_current_tenant] = fake_current_tenant
    try:
        response = TestClient(main.app).post(
            "/team/invite", json={"email": "neu@example.com", "role": "member"}
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["detail"] == "Nur Owner und Admins dürfen das Team verwalten"


def test_team_member_access_migration_uses_safe_rls_policies():
    migration = (
        ROOT / "db" / "migrations" / "versions" / "0008_team_member_access.py"
    ).read_text()

    assert 'security definer' in migration
    assert 'set row_security = off' in migration
    assert 'where user_id = auth.uid()' in migration
    assert 'for select using (id = public.my_tenant_id())' in migration
    assert 'revoke insert, update, delete on public.team_members from authenticated' in migration
    assert 'grant update (accepted) on public.team_members to authenticated' in migration


def test_team_member_admin_migration_restores_owner_managed_seats():
    migration = (
        ROOT / "db" / "migrations" / "versions" / "0009_team_member_admin.py"
    ).read_text()

    assert "create or replace function public.can_manage_team" in migration
    assert "security definer" in migration
    assert "set row_security = off" in migration
    assert "role in ('owner', 'admin')" in migration
    assert 'create policy "team_members: admin insert"' in migration
    assert 'create policy "team_members: admin delete"' in migration
    assert "grant insert (tenant_id, user_id, role, accepted)" in migration
    assert "grant delete on public.team_members to authenticated" in migration


def test_integration_admin_migration_restricts_sensitive_tables():
    migration = (
        ROOT / "db" / "migrations" / "versions" / "0010_integration_admin_rls.py"
    ).read_text()

    for table in ("api_keys", "alert_channels", "connector_sources"):
        assert f'drop policy if exists "{table}: own tenant"' in migration
        assert f'create policy "{table}: admin select"' in migration
        assert f"on public.{table}" in migration
        assert "public.can_manage_team(tenant_id)" in migration
    assert 'create policy "api_keys: admin update"' in migration
    assert 'create policy "alert_channels: admin delete"' in migration
    assert 'create policy "connector_sources: admin delete"' in migration
    assert "notify pgrst, 'reload schema'" in migration


def test_team_admin_rls_requires_accepted_membership():
    migration = (
        ROOT / "db" / "migrations" / "versions" / "0011_acceptance_required_for_team_admin.py"
    ).read_text()

    assert "create or replace function public.can_manage_team" in migration
    assert "alter table alembic_version alter column version_num type varchar(64)" in migration
    assert "role in ('owner', 'admin')" in migration
    assert "and accepted = true" in migration
    assert "set row_security = off" in migration


def test_team_data_scope_requires_accepted_membership_but_allows_invite_acceptance():
    migration = (
        ROOT / "db" / "migrations" / "versions" / "0012_accepted_membership_data_scope.py"
    ).read_text()

    assert "create or replace function public.my_tenant_id" in migration
    assert "where user_id = auth.uid()\n              and accepted = true" in migration
    assert 'drop policy if exists "tenants: visible membership"' in migration
    assert "where tenant_id = public.tenants.id" in migration
    assert 'create policy "team_members: visible membership"' in migration
    assert "or user_id = auth.uid()" in migration
    assert 'create policy "team_members: accept own invite"' in migration
    assert "with check (user_id = auth.uid())" in migration


def test_team_members_can_only_update_invite_acceptance_column():
    migration = (
        ROOT / "db" / "migrations" / "versions" / "0013_restrict_membership_update.py"
    ).read_text()

    assert "revoke update on public.team_members from authenticated" in migration
    assert "grant update (accepted) on public.team_members to authenticated" in migration
    assert "grant update on public.team_members to authenticated" in migration


def test_related_records_enforce_tenant_reference_integrity():
    migration = (
        ROOT / "db" / "migrations" / "versions" / "0014_tenant_reference_integrity.py"
    ).read_text()

    for constraint in (
        "competitor_products_product_tenant_fkey",
        "competitor_products_competitor_tenant_fkey",
        "price_snapshots_mapping_tenant_fkey",
        "alerts_product_tenant_fkey",
        "alerts_competitor_tenant_fkey",
        "alert_events_alert_tenant_fkey",
        "alert_events_mapping_tenant_fkey",
        "scrape_failures_product_tenant_fkey",
        "scrape_failures_mapping_tenant_fkey",
    ):
        assert f"constraint {constraint}" in migration
    assert "foreign key (product_id, tenant_id)" in migration
    assert "foreign key (competitor_product_id, tenant_id)" in migration


def test_structlog_emits_first_class_json_fields(capsys):
    from utils.logger import configure_logging, get_logger

    configure_logging()
    get_logger("contract").info(
        "scrape_complete",
        action="scrape_complete",
        tenant_id="tenant-1",
        duration_ms=42,
    )

    payload = json.loads(capsys.readouterr().out)
    assert payload["event"] == "scrape_complete"
    assert payload["agent"] == "contract"
    assert payload["tenant_id"] == "tenant-1"
    assert payload["duration_ms"] == 42
    assert payload["level"] == "info"


def test_admin_overview_degrades_when_optional_support_tables_are_missing(monkeypatch):
    from routers import admin

    async def list_tenants():
        return [{"id": "tenant-1", "shop_name": "Growvault", "plan": "agency"}]

    async def missing_scrape_jobs(*, limit):
        del limit
        raise RuntimeError("Could not find the table 'public.scrape_jobs'")

    async def empty_rows(*, limit):
        del limit
        return []

    monkeypatch.setattr(admin.queries, "list_tenants", list_tenants)
    monkeypatch.setattr(admin.queries, "list_scrape_jobs", missing_scrape_jobs)
    monkeypatch.setattr(admin.queries, "list_report_runs", empty_rows)
    monkeypatch.setattr(admin.queries, "list_connector_sync_runs", empty_rows)
    monkeypatch.setattr(admin.queries, "list_audit_events", empty_rows)

    result = asyncio.run(admin.overview(limit=20, admin_tenant={"id": "tenant-1"}))

    assert result["tenants"][0]["shop_name"] == "Growvault"
    assert result["scrape_jobs"] == []
    assert result["access_issues"][0]["resource"] == "scrape_jobs"
    assert "nicht verfuegbar" in result["access_issues"][0]["message"]


async def _collect_async(generator):
    return [item async for item in generator]
