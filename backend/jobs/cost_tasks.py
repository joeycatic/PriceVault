"""Daily internal usage-cost summaries; rates contain no provider credentials."""

from datetime import datetime, timedelta, timezone

from db import queries
from db.client import supabase_context


async def summarize_operational_costs(ctx: dict) -> dict[str, int]:
    del ctx
    target = datetime.now(timezone.utc).date() - timedelta(days=1)
    start = datetime.combine(target, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    with supabase_context(admin=True):
        events = [
            event
            for event in await queries.list_usage_events_since(start.isoformat())
            if datetime.fromisoformat(str(event["occurred_at"]).replace("Z", "+00:00")) < end
        ]
        rates = {row["metric"]: float(row["cost_eur_per_unit"]) for row in await queries.list_internal_cost_rates()}
        by_tenant: dict[str, dict[str, float]] = {}
        for event in events:
            usage = by_tenant.setdefault(event["tenant_id"], {})
            metric = event["metric"]
            usage[metric] = usage.get(metric, 0) + float(event["quantity"])
        for tenant_id, usage in by_tenant.items():
            await queries.upsert_tenant_cost_summary(
                {
                    "tenant_id": tenant_id,
                    "summary_date": target.isoformat(),
                    "estimated_cost_eur": round(sum(quantity * rates.get(metric, 0) for metric, quantity in usage.items()), 4),
                    "usage": usage,
                    "calculated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
    return {"summaries": len(by_tenant)}
