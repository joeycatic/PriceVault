"""Plan-gated route dependencies and quota helpers."""

from fastapi import Depends, HTTPException

from auth.dependencies import get_current_tenant


PLAN_RANK = {"free": 0, "trial": 0, "starter": 1, "pro": 1, "agency": 2}
PLAN_LIMITS: dict[str, dict[str, int | None]] = {
    "free": {"scrapes_per_day": 50, "products": 5, "alerts": 3, "seats": 1},
    "trial": {"scrapes_per_day": 50, "products": 5, "alerts": 3, "seats": 1},
    "starter": {"scrapes_per_day": 500, "products": 50, "alerts": None, "seats": 1},
    "pro": {"scrapes_per_day": 500, "products": 50, "alerts": None, "seats": 1},
    "agency": {"scrapes_per_day": 5000, "products": None, "alerts": None, "seats": 5},
}
RESOURCE_LABELS = {"products": "aktive Produkte", "alerts": "aktive Preisalarme", "seats": "Team-Sitze"}


def plan_limit(plan: str | None, resource: str) -> int | None:
    return PLAN_LIMITS.get(plan or "free", PLAN_LIMITS["free"])[resource]


def assert_plan_capacity(
    plan: str | None, resource: str, current_count: int, add_count: int = 1
) -> None:
    limit = plan_limit(plan, resource)
    if limit is not None and current_count + add_count > limit:
        raise HTTPException(
            status_code=403,
            detail=f"Dein Plan erlaubt maximal {limit} {RESOURCE_LABELS.get(resource, resource)}.",
        )


def require_plan(minimum: str):
    async def dependency(tenant: dict = Depends(get_current_tenant)) -> dict:
        if PLAN_RANK.get(tenant.get("plan", "free"), 0) < PLAN_RANK[minimum]:
            raise HTTPException(
                status_code=403, detail=f"Plan '{minimum}' oder höher erforderlich"
            )
        return tenant

    return dependency


def require_plan_admin(minimum: str):
    async def dependency(tenant: dict = Depends(require_plan(minimum))) -> dict:
        if tenant.get("_role", "owner") not in {"owner", "admin"}:
            raise HTTPException(
                status_code=403,
                detail="Nur Owner und Admins dürfen Integrationen verwalten",
            )
        return tenant

    return dependency


async def require_team_admin(
    tenant: dict = Depends(require_plan("agency")),
) -> dict:
    if tenant.get("_role", "owner") not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Nur Owner und Admins dürfen das Team verwalten")
    return tenant


async def require_owner(
    tenant: dict = Depends(get_current_tenant),
) -> dict:
    if tenant.get("_role", "owner") != "owner":
        raise HTTPException(status_code=403, detail="Nur Owner dürfen diese Aktion ausführen")
    return tenant
