"""Shopify Admin REST product import helpers."""

from collections.abc import AsyncGenerator

import httpx

from security.urls import normalize_shopify_domain


async def fetch_shopify_products(
    shop_domain: str, access_token: str
) -> AsyncGenerator[dict, None]:
    normalized_domain = normalize_shopify_domain(shop_domain)
    headers = {"X-Shopify-Access-Token": access_token}
    url: str | None = f"https://{normalized_domain}/admin/api/2024-04/products.json?limit=250"
    async with httpx.AsyncClient() as client:
        while url:
            response = await client.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            payload = response.json()
            for product in payload.get("products", []):
                yield {
                    "id": str(product["id"]),
                    "title": product["title"],
                    "handle": product["handle"],
                    "url": f"https://{normalized_domain}/products/{product['handle']}",
                    "variants": [
                        {
                            "id": str(variant["id"]),
                            "title": variant.get("title") or "Standard",
                            "price": float(variant["price"]),
                            "sku": variant.get("sku") or None,
                            "gtin": variant.get("barcode") or None,
                        }
                        for variant in product.get("variants", [])
                    ],
                }
            url = _next_page_url(response.headers.get("Link", ""), normalized_domain)


def _next_page_url(link_header: str, expected_host: str) -> str | None:
    for part in link_header.split(","):
        if 'rel="next"' in part:
            candidate = part.split(";")[0].strip().strip("<>")
            parsed = httpx.URL(candidate)
            if parsed.scheme == "https" and parsed.host == expected_host:
                return candidate
    return None
