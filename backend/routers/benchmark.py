"""Catalog-wide price position benchmark."""

from fastapi import APIRouter, Depends

from auth.plan_guard import require_plan
from db import queries
from routers import get_tenant


router = APIRouter(
    prefix="/benchmark",
    tags=["benchmark"],
    dependencies=[Depends(require_plan("pro"))],
)


def compute_rank(*, our_price: float, competitor_prices: list[float]) -> tuple[int, int]:
    cheaper = sum(1 for price in competitor_prices if price < our_price)
    return cheaper + 1, len(competitor_prices) + 1


def classify_position(*, our_price: float, lowest: float) -> str:
    if our_price <= lowest:
        return "cheapest"
    delta_pct = (our_price - lowest) / lowest * 100
    if delta_pct <= 5:
        return "within_5_pct"
    if delta_pct <= 15:
        return "mid"
    return "most_expensive"


@router.get("")
async def benchmark(tenant_id: str = Depends(get_tenant)) -> dict:
    variants = await queries.list_product_variants(tenant_id, active_only=True)
    prices = await queries.get_latest_prices(tenant_id)
    by_variant: dict[str, list[float]] = {}
    for row in prices:
        if row.get("competitor_price") is not None:
            by_variant.setdefault(row["variant_id"], []).append(float(row["competitor_price"]))

    summary = {
        "cheapest": 0,
        "within_5_pct": 0,
        "mid": 0,
        "most_expensive": 0,
        "no_data": 0,
    }
    rows = []
    for variant in variants:
        our_price = variant.get("our_price")
        competitor_prices = by_variant.get(variant["id"], [])
        if our_price is None or not competitor_prices:
            summary["no_data"] += 1
            continue

        our = float(our_price)
        lowest = min(competitor_prices)
        highest = max(competitor_prices)
        rank, of = compute_rank(our_price=our, competitor_prices=competitor_prices)
        position = classify_position(our_price=our, lowest=lowest)
        summary[position] += 1
        product = variant.get("products") or {}
        rows.append(
            {
                "product_id": variant["product_id"],
                "variant_id": variant["id"],
                "product_name": product.get("name") or variant.get("name"),
                "our_price": our,
                "lowest": lowest,
                "highest": highest,
                "rank": rank,
                "of": of,
                "delta_to_lowest_pct": round((our - lowest) / lowest * 100, 1)
                if lowest
                else None,
                "position": position,
            }
        )
    rows.sort(key=lambda row: -(row["delta_to_lowest_pct"] or 0))
    return {"summary": summary, "rows": rows}
