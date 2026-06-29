"""Tenant-scoped product and competitor mapping endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from db import queries
from models.schemas import ProductCreate, ProductMappingCreate, ProductUpdate
from routers import get_tenant


router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
async def list_all(tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_products(tenant_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: ProductCreate, tenant_id: str = Depends(get_tenant)) -> dict:
    return await queries.create_product(tenant_id, body.model_dump(mode="json"))


@router.patch("/{product_id}")
async def update(
    product_id: str, body: ProductUpdate, tenant_id: str = Depends(get_tenant)
) -> dict:
    product = await queries.update_product(
        tenant_id, product_id, body.model_dump(exclude_unset=True, mode="json")
    )
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(product_id: str, tenant_id: str = Depends(get_tenant)) -> Response:
    if not await queries.soft_delete_product(tenant_id, product_id):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{product_id}/mappings")
async def list_mappings(product_id: str, tenant_id: str = Depends(get_tenant)) -> list[dict]:
    return await queries.list_product_mappings(tenant_id, product_id)


@router.post("/{product_id}/mappings", status_code=status.HTTP_201_CREATED)
async def create_mapping(
    product_id: str, body: ProductMappingCreate, tenant_id: str = Depends(get_tenant)
) -> dict:
    return await queries.create_product_mapping(
        tenant_id, product_id, body.model_dump(mode="json")
    )


@router.delete("/{product_id}/mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mapping(
    product_id: str, mapping_id: str, tenant_id: str = Depends(get_tenant)
) -> Response:
    del product_id
    if not await queries.delete_product_mapping(tenant_id, mapping_id):
        raise HTTPException(status_code=404, detail="Zuordnung nicht gefunden")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

