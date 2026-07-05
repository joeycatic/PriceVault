"""Customer-visible usage without internal cost data."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from auth.dependencies import get_current_tenant
from auth.plan_guard import PLAN_LIMITS
from db import queries


router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/summary")
async def summary(tenant: dict = Depends(get_current_tenant)) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    measured = await queries.tenant_usage_summary(tenant["id"], since)
    limits = PLAN_LIMITS.get(tenant.get("plan", "free"), PLAN_LIMITS["free"])
    return {
        "plan": tenant.get("plan", "free"),
        "period_days": 30,
        "limits": {
            "products": limits["products"], "competitors": limits["competitors"],
            "scrapes_per_day": limits["scrapes_per_day"],
            "reports": None, "emails": None, "snapshot_retention_days": 730,
        },
        "measured": measured,
        "hard_enforcement": False,
    }
