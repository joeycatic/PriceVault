"""Team seat management."""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from auth.plan_guard import require_plan, require_team_admin
from db import queries
from db.client import get_supabase_admin
from models.schemas import TeamInviteRequest


router = APIRouter(prefix="/team", tags=["team"])
SEAT_LIMITS = {"free": 1, "trial": 1, "starter": 1, "pro": 1, "agency": 5}


@router.get("")
async def list_all(tenant: dict = Depends(require_plan("agency"))) -> list[dict]:
    return await queries.list_team_members(tenant["id"])


@router.post("/invite", status_code=status.HTTP_201_CREATED)
async def invite_member(
    body: TeamInviteRequest, tenant: dict = Depends(require_team_admin)
) -> dict:
    members = await queries.list_team_members(tenant["id"])
    if len(members) >= SEAT_LIMITS.get(tenant.get("plan", "free"), 1):
        raise HTTPException(status_code=403, detail="Sitzlimit für deinen Plan erreicht")
    response = get_supabase_admin().auth.admin.invite_user_by_email(
        str(body.email), {"data": {"tenant_id": tenant["id"], "role": body.role}}
    )
    user_id = response.user.id
    await queries.insert_team_member(
        {
            "tenant_id": tenant["id"],
            "user_id": user_id,
            "role": body.role,
            "accepted": False,
        }
    )
    return {"invited": str(body.email), "user_id": user_id}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(user_id: str, tenant: dict = Depends(require_team_admin)) -> Response:
    if not await queries.delete_team_member(tenant["id"], user_id):
        raise HTTPException(status_code=404, detail="Teammitglied nicht gefunden")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
