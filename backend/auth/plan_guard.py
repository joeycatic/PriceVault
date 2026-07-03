"""Plan-gated route dependencies and quota helpers."""

from fastapi import Depends, HTTPException, Request

from auth.dependencies import get_current_tenant
from db import queries
from routers import get_tenant


PLAN_RANK = {"free": 0, "trial": 0, "starter": 1, "pro": 1, "agency": 2}
PLAN_LIMITS: dict[str, dict[str, int | None]] = {
    "free": {"scrapes_per_day": 50, "products": 5, "competitors": 2, "alerts": 3, "seats": 1},
    "trial": {"scrapes_per_day": 50, "products": 5, "competitors": 2, "alerts": 3, "seats": 1},
    "starter": {"scrapes_per_day": 500, "products": 50, "competitors": 10, "alerts": None, "seats": 1},
    "pro": {"scrapes_per_day": 500, "products": 50, "competitors": 10, "alerts": None, "seats": 1},
    "agency": {"scrapes_per_day": 5000, "products": None, "competitors": None, "alerts": None, "seats": 5},
}
RESOURCE_LABELS = {"products": "aktive Produkte", "competitors": "aktive Mitbewerber", "alerts": "aktive Preisalarme", "seats": "Team-Sitze"}
ADMIN_ROLES = {"owner", "admin"}
BILLING_ROLES = {"owner", "admin", "billing"}
MIN_SCRAPE_FREQUENCY_H = {"free": 12, "trial": 12, "starter": 6, "pro": 6, "agency": 1}


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


def assert_scrape_frequency(plan: str | None, frequency_h: int) -> None:
    minimum = MIN_SCRAPE_FREQUENCY_H.get(plan or "free", 12)
    if frequency_h < minimum:
        raise HTTPException(
            status_code=403,
            detail=f"Dein Plan erlaubt Abrufintervalle ab {minimum} Stunden.",
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
        if tenant.get("_role", "owner") not in ADMIN_ROLES:
            raise HTTPException(
                status_code=403,
                detail="Nur Owner und Admins dürfen Integrationen verwalten",
            )
        return tenant

    return dependency


async def require_tenant_admin(tenant: dict = Depends(get_current_tenant)) -> dict:
    if tenant.get("_role", "owner") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Nur Owner und Admins dürfen diese Aktion ausführen")
    return tenant


async def require_tenant_admin_from_header(
    request: Request, tenant_id: str = Depends(get_tenant)
) -> dict:
    user_id = getattr(request.state, "user_id", None)
    user_email = getattr(request.state, "user_email", None)
    try:
        tenant = await queries.get_tenant_by_id(tenant_id)
    except Exception:
        tenant = None
    if not tenant:
        return {
            "id": tenant_id,
            "user_id": user_id,
            "_actor_user_id": user_id,
            "_email": user_email,
            "_role": "owner",
        }
    role = "owner"
    if user_id and tenant.get("user_id") != user_id:
        membership = await queries.get_team_member(tenant_id, user_id)
        if not membership:
            raise HTTPException(status_code=403, detail="Kein Zugriff auf diesen Mandanten")
        role = membership["role"]
    if role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Nur Owner und Admins dürfen diese Aktion ausführen")
    return {**tenant, "_role": role, "_email": user_email, "_actor_user_id": user_id}


async def require_billing_role(tenant: dict = Depends(get_current_tenant)) -> dict:
    if tenant.get("_role", "owner") not in BILLING_ROLES:
        raise HTTPException(status_code=403, detail="Nur Billing, Owner und Admins dürfen diese Aktion ausführen")
    return tenant


async def require_team_admin(
    tenant: dict = Depends(require_plan("agency")),
) -> dict:
    if tenant.get("_role", "owner") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Nur Owner und Admins dürfen das Team verwalten")
    return tenant


async def require_owner(
    tenant: dict = Depends(get_current_tenant),
) -> dict:
    if tenant.get("_role", "owner") != "owner":
        raise HTTPException(status_code=403, detail="Nur Owner dürfen diese Aktion ausführen")
    return tenant
