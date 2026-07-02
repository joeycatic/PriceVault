"""Tenant-scoped product and competitor mapping endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from auth.dependencies import get_current_tenant
from auth.plan_guard import assert_plan_capacity, require_tenant_admin_from_header
from db import queries
from models.schemas import ProductCreate, ProductMappingCreate, ProductUpdate
from routers import get_tenant
from routers.audit import record_audit_event


router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
async def list_all(tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_products(tenant_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: ProductCreate, tenant: dict = Depends(get_current_tenant)) -> dict:
    tenant_id = tenant["id"]
    active_count = await queries.count_active_products(tenant_id)
    assert_plan_capacity(tenant.get("plan"), "products", active_count)
    product = await queries.create_product(tenant_id, body.model_dump(mode="json"))
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


@router.post("/{product_id}/mappings", status_code=status.HTTP_201_CREATED)
async def create_mapping(
    product_id: str, body: ProductMappingCreate, tenant: dict = Depends(require_tenant_admin_from_header)
) -> dict:
    tenant_id = tenant["id"]
    if not await queries.get_product(tenant_id, product_id):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    if not await queries.get_competitor(tenant_id, body.competitor_id):
        raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
    mapping = await queries.create_product_mapping(
        tenant_id, product_id, body.model_dump(mode="json")
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
