"""Tenant-scoped product and competitor mapping endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from auth.dependencies import get_current_tenant
from auth.plan_guard import assert_plan_capacity, require_tenant_admin_from_header
from db import queries
from models.schemas import (
    ProductCreate,
    ProductMappingCreate,
    PublicCatalogDiscoverRequest,
    ProductUpdate,
    ProductVariantCreate,
    ProductVariantUpdate,
)
from routers import get_tenant
from routers.audit import record_audit_event
from scrapers.public_catalog import discover_public_catalog
from scrapers.policy import evaluate_source_policy


router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
async def list_all(tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_products(tenant_id)


@router.post("/discover")
async def discover_catalog(
    body: PublicCatalogDiscoverRequest,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    try:
        products = await discover_public_catalog(body.base_url, body.max_products)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Der Shop-Katalog konnte nicht gelesen werden") from exc
    await record_audit_event(
        tenant,
        action="product_catalog.discovered",
        resource_type="shop_catalog",
        metadata={"base_url": body.base_url, "max_products": body.max_products, "found": len(products)},
    )
    return {"products": products, "found": len(products)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: ProductCreate, tenant: dict = Depends(get_current_tenant)) -> dict:
    tenant_id = tenant["id"]
    active_count = await queries.count_active_products(tenant_id)
    assert_plan_capacity(tenant.get("plan"), "products", active_count)
    product = await queries.create_product(tenant_id, body.model_dump(mode="json"))
    await queries.create_product_variant(
        tenant_id,
        product["id"],
        {
            "name": "Standard",
            "sku": body.our_sku,
            "our_price": body.our_price,
            "currency": body.our_currency,
            "is_default": True,
        },
    )
    await record_audit_event(
        tenant,
        action="product.created",
        resource_type="product",
        resource_id=product.get("id"),
        metadata={"name": product.get("name")},
    )
    return product


@router.patch("/{product_id}")
async def update(
    product_id: str, body: ProductUpdate, tenant: dict = Depends(require_tenant_admin_from_header)
) -> dict:
    tenant_id = tenant["id"]
    if body.active is True:
        current = await queries.get_product(tenant_id, product_id)
        if not current:
            raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
        if not current.get("active", True):
            tenant = await queries.get_tenant_by_id(tenant_id)
            active_count = await queries.count_active_products(tenant_id)
            assert_plan_capacity(tenant.get("plan") if tenant else None, "products", active_count)
    product = await queries.update_product(
        tenant_id, product_id, body.model_dump(exclude_unset=True, mode="json")
    )
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    await record_audit_event(
        tenant,
        action="product.updated",
        resource_type="product",
        resource_id=product_id,
        metadata={"fields": sorted(body.model_dump(exclude_unset=True).keys())},
    )
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(product_id: str, tenant: dict = Depends(require_tenant_admin_from_header)) -> Response:
    tenant_id = tenant["id"]
    if not await queries.soft_delete_product(tenant_id, product_id):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    await record_audit_event(
        tenant,
        action="product.deleted",
        resource_type="product",
        resource_id=product_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{product_id}/mappings")
async def list_mappings(product_id: str, tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_product_mappings(tenant_id, product_id)


@router.get("/{product_id}/variants")
async def list_variants(product_id: str, tenant_id: str = Depends(get_tenant)) -> list[dict]:
    if not await queries.get_product(tenant_id, product_id):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    return await queries.list_product_variants(tenant_id, product_id)


@router.post("/{product_id}/variants", status_code=status.HTTP_201_CREATED)
async def create_variant(
    product_id: str,
    body: ProductVariantCreate,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    if not await queries.get_product(tenant["id"], product_id):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    return await queries.create_product_variant(
        tenant["id"], product_id, body.model_dump(mode="json")
    )


@router.patch("/{product_id}/variants/{variant_id}")
async def update_variant(
    product_id: str,
    variant_id: str,
    body: ProductVariantUpdate,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    variant = await queries.get_product_variant(tenant["id"], variant_id)
    if not variant or variant["product_id"] != product_id:
        raise HTTPException(status_code=404, detail="Variante nicht gefunden")
    return await queries.update_product_variant(
        tenant["id"], variant_id, body.model_dump(exclude_unset=True, mode="json")
    ) or {}


@router.post("/{product_id}/mappings", status_code=status.HTTP_201_CREATED)
async def create_mapping(
    product_id: str, body: ProductMappingCreate, tenant: dict = Depends(require_tenant_admin_from_header)
) -> dict:
    tenant_id = tenant["id"]
    if not await queries.get_product(tenant_id, product_id):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    if not await queries.get_competitor(tenant_id, body.competitor_id):
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    variant = await queries.get_product_variant(tenant_id, body.variant_id)
    if not variant or variant["product_id"] != product_id:
        raise HTTPException(status_code=404, detail="Variante nicht gefunden")
    if not body.customer_authorized:
        raise HTTPException(status_code=400, detail="Die Berechtigung zum Abruf der Preisquelle muss bestätigt werden")
    decision = await evaluate_source_policy(str(body.competitor_url))
    if not decision.allowed:
        raise HTTPException(status_code=400, detail=decision.block_reason or "Die Preisquelle darf laut robots.txt nicht abgerufen werden")
    values = body.model_dump(mode="json", exclude={"customer_authorized"})
    mapping = await queries.create_product_mapping(
        tenant_id, product_id, values
    )
    await queries.upsert_source_policy(
        tenant_id,
        mapping["id"],
        {
            "robots_result": decision.robots_result,
            "robots_checked_at": decision.checked_at.isoformat(),
            "crawl_delay_seconds": decision.crawl_delay_seconds,
            "approved_host": decision.approved_host,
            "block_reason": decision.block_reason,
            "customer_authorized_at": decision.checked_at.isoformat(),
            "customer_authorized_by": tenant.get("_actor_user_id") or tenant.get("user_id"),
        },
    )
    await record_audit_event(
        tenant,
        action="product_mapping.created",
        resource_type="competitor_product",
        resource_id=mapping.get("id"),
        metadata={"product_id": product_id, "competitor_id": body.competitor_id},
    )
    return mapping


@router.delete("/{product_id}/mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mapping(
    product_id: str, mapping_id: str, tenant: dict = Depends(require_tenant_admin_from_header)
) -> Response:
    tenant_id = tenant["id"]
    if not await queries.delete_product_mapping(tenant_id, mapping_id):
        raise HTTPException(status_code=404, detail="Zuordnung nicht gefunden")
    await record_audit_event(
        tenant,
        action="product_mapping.deleted",
        resource_type="competitor_product",
        resource_id=mapping_id,
        metadata={"product_id": product_id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
