"""Shopify connector endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from auth.plan_guard import assert_plan_capacity, require_plan_admin
from db import queries
from models.schemas import ShopifyImportRequest
from security.crypto import encrypt_secret
from scrapers.shopify_catalog import fetch_shopify_products


router = APIRouter(prefix="/connectors/shopify", tags=["connectors"])


@router.post("/import")
async def import_products(
    body: ShopifyImportRequest, tenant: dict = Depends(require_plan_admin("pro"))
) -> dict[str, int]:
    try:
        encrypted_token = encrypt_secret(body.access_token)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    products = [
        product async for product in fetch_shopify_products(body.shop_domain, body.access_token)
    ]
    active_count = await queries.count_active_products(tenant["id"])
    assert_plan_capacity(tenant.get("plan"), "products", active_count, len(products))

    await queries.create_connector_source(
        tenant["id"],
        {
            "type": "shopify",
            "name": body.shop_domain,
            "config": {
                "shop_domain": body.shop_domain,
                "access_token_ciphertext": encrypted_token,
            },
            "credential_metadata": {"access_token": "encrypted"},
            "provider_details": {"mode": "admin_rest"},
        },
    )
    for product in products:
        first_variant = product["variants"][0] if product["variants"] else {}
        await queries.create_product(
            tenant["id"],
            {
                "name": product["title"],
                "our_sku": first_variant.get("sku"),
                "our_price": first_variant.get("price"),
                "our_currency": "EUR",
            },
        )
    return {"imported": len(products)}
