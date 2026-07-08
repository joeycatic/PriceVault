import asyncio

from agents.matcher_agent import MatchCandidate
from auth.plan_guard import require_tenant_admin
from models.schemas import MatchSuggestionGenerateCatalogRequest
from routers import scrape


def test_generate_catalog_skips_mapped_and_pending_pairs_and_uses_expected_search(monkeypatch):
    created_values = []
    searched_requests = []

    variants = [
        {"id": "variant-gtin", "product_id": "product-1", "name": "Standard", "gtin": "12345678"},
        {"id": "variant-name", "product_id": "product-1", "name": "Rot", "gtin": None},
        {"id": "variant-mapped", "product_id": "product-1", "name": "Blau", "gtin": None},
        {"id": "variant-pending", "product_id": "product-1", "name": "Gruen", "gtin": None},
    ]
    products = [{"id": "product-1", "name": "Grow Lampe"}]
    competitors = [
        {
            "id": "competitor-1",
            "tenant_id": "tenant-1",
            "shop_name": "Shop A",
            "base_url": "https://shop-a.example",
            "active": True,
        }
    ]

    async def list_product_variants(tenant_id, active_only=False):
        assert tenant_id == "tenant-1"
        assert active_only is True
        return variants

    async def list_products(tenant_id, active_only=False):
        assert tenant_id == "tenant-1"
        assert active_only is True
        return products

    async def list_competitors(tenant_id, active_only=False):
        assert tenant_id == "tenant-1"
        assert active_only is True
        return competitors

    async def get_mapping_for_variant_competitor(tenant_id, variant_id, competitor_id):
        assert tenant_id == "tenant-1"
        assert competitor_id == "competitor-1"
        return {"id": "mapping-1"} if variant_id == "variant-mapped" else None

    async def has_pending_match_suggestion_for_variant_competitor(tenant_id, variant_id, competitor_id):
        assert tenant_id == "tenant-1"
        assert competitor_id == "competitor-1"
        return variant_id == "variant-pending"

    async def create_match_suggestions(values):
        created_values.extend(values)

    async def record_audit_event(*args, **kwargs):
        return None

    class FakeMatcher:
        async def search(self, request):
            searched_requests.append(request)
            return [
                MatchCandidate(
                    url=f"{request.competitor_base_url}/{request.product_name.replace(' ', '-').lower()}",
                    title=request.product_name,
                    confidence=0.91,
                )
            ]

    monkeypatch.setattr(scrape.queries, "list_product_variants", list_product_variants)
    monkeypatch.setattr(scrape.queries, "list_products", list_products)
    monkeypatch.setattr(scrape.queries, "list_competitors", list_competitors)
    monkeypatch.setattr(scrape.queries, "get_mapping_for_variant_competitor", get_mapping_for_variant_competitor)
    monkeypatch.setattr(
        scrape.queries,
        "has_pending_match_suggestion_for_variant_competitor",
        has_pending_match_suggestion_for_variant_competitor,
    )
    monkeypatch.setattr(scrape.queries, "create_match_suggestions", create_match_suggestions)
    monkeypatch.setattr(scrape, "record_audit_event", record_audit_event)
    monkeypatch.setattr(scrape, "MatcherAgent", FakeMatcher)

    result = asyncio.run(
        scrape.generate_catalog_match_suggestions(
            MatchSuggestionGenerateCatalogRequest(),
            {"id": "tenant-1", "_role": "admin", "user_id": "user-1"},
        )
    )

    assert result == {
        "searched_pairs": 2,
        "skipped_pairs": 2,
        "suggestions": 2,
        "competitors_searched": 1,
    }
    assert [request.product_name for request in searched_requests] == ["Grow Lampe", "Grow Lampe Rot"]
    assert [request.gtin for request in searched_requests] == ["12345678", None]
    assert [value["tenant_id"] for value in created_values] == ["tenant-1", "tenant-1"]
    assert [value["variant_id"] for value in created_values] == ["variant-gtin", "variant-name"]
    assert [value["competitor_id"] for value in created_values] == ["competitor-1", "competitor-1"]
    assert [value["match_method"] for value in created_values] == ["gtin", "fuzzy"]


def test_generate_catalog_honors_limit_and_requested_competitors(monkeypatch):
    searched_requests = []

    async def list_product_variants(tenant_id, active_only=False):
        return [
            {"id": "variant-1", "product_id": "product-1", "name": "Standard", "gtin": None},
            {"id": "variant-2", "product_id": "product-1", "name": "XL", "gtin": None},
        ]

    async def list_products(tenant_id, active_only=False):
        return [{"id": "product-1", "name": "Zelt"}]

    async def get_competitor(tenant_id, competitor_id):
        return {
            "id": competitor_id,
            "tenant_id": tenant_id,
            "shop_name": "Shop",
            "base_url": f"https://{competitor_id}.example",
            "active": True,
        }

    async def get_mapping_for_variant_competitor(*args):
        return None

    async def has_pending_match_suggestion_for_variant_competitor(*args):
        return False

    async def create_match_suggestions(values):
        return None

    async def record_audit_event(*args, **kwargs):
        return None

    class FakeMatcher:
        async def search(self, request):
            searched_requests.append(request)
            return [MatchCandidate(url=f"{request.competitor_base_url}/hit", title="Hit", confidence=0.8)]

    monkeypatch.setattr(scrape.queries, "list_product_variants", list_product_variants)
    monkeypatch.setattr(scrape.queries, "list_products", list_products)
    monkeypatch.setattr(scrape.queries, "get_competitor", get_competitor)
    monkeypatch.setattr(scrape.queries, "get_mapping_for_variant_competitor", get_mapping_for_variant_competitor)
    monkeypatch.setattr(
        scrape.queries,
        "has_pending_match_suggestion_for_variant_competitor",
        has_pending_match_suggestion_for_variant_competitor,
    )
    monkeypatch.setattr(scrape.queries, "create_match_suggestions", create_match_suggestions)
    monkeypatch.setattr(scrape, "record_audit_event", record_audit_event)
    monkeypatch.setattr(scrape, "MatcherAgent", FakeMatcher)

    result = asyncio.run(
        scrape.generate_catalog_match_suggestions(
            MatchSuggestionGenerateCatalogRequest(competitor_ids=["competitor-a", "competitor-b"], limit=1),
            {"id": "tenant-1", "_role": "owner"},
        )
    )

    assert result["searched_pairs"] == 1
    assert result["suggestions"] == 1
    assert result["competitors_searched"] == 2
    assert [request.competitor_id for request in searched_requests] == ["competitor-a"]


def test_generate_catalog_route_is_admin_only():
    route = next(route for route in scrape.router.routes if getattr(route, "path", "") == "/match/suggestions/generate-catalog")

    assert any(dependency.call is require_tenant_admin for dependency in route.dependant.dependencies)
