"""Team seat management."""

from contextlib import suppress

from fastapi import APIRouter, Depends, HTTPException, Response, status

from auth.plan_guard import require_plan, require_team_admin
from db import queries
from db.client import get_supabase_admin
from models.schemas import TeamInviteRequest, TeamMemberUpdate
from routers.audit import record_audit_event


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
    with suppress(Exception):
        await queries.update_team_member(
            tenant["id"],
            user_id,
            {"invite_email": str(body.email)},
        )
    await record_audit_event(
        tenant,
        action="team.invited",
        resource_type="team_member",
        resource_id=user_id,
        metadata={"email": str(body.email), "role": body.role},
    )
    return {"invited": str(body.email), "user_id": user_id}


@router.patch("/{user_id}")
async def update_member(
    user_id: str, body: TeamMemberUpdate, tenant: dict = Depends(require_team_admin)
) -> dict:
    existing = await queries.get_team_member(tenant["id"], user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Teammitglied nicht gefunden")
    if existing.get("role") == "owner" and body.role != "owner":
        owners = await queries.count_owner_members(tenant["id"])
        if owners <= 1:
            raise HTTPException(status_code=409, detail="Der letzte Owner kann nicht geändert werden")
    member = await queries.update_team_member(tenant["id"], user_id, {"role": body.role})
    await record_audit_event(
        tenant,
        action="team.role_changed",
        resource_type="team_member",
        resource_id=user_id,
        metadata={"from": existing.get("role"), "to": body.role},
    )
    return member or {}


@router.post("/{user_id}/resend")
async def resend_invite(user_id: str, tenant: dict = Depends(require_team_admin)) -> dict[str, bool]:
    member = await queries.get_team_member(tenant["id"], user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Teammitglied nicht gefunden")
    if member.get("accepted"):
        raise HTTPException(status_code=409, detail="Einladung wurde bereits angenommen")
    email = member.get("invite_email")
    if not email:
        raise HTTPException(status_code=409, detail="Keine Einladungs-E-Mail gespeichert")
    get_supabase_admin().auth.admin.invite_user_by_email(
        email, {"data": {"tenant_id": tenant["id"], "role": member.get("role")}}
    )
    await record_audit_event(
        tenant,
        action="team.invite_resent",
        resource_type="team_member",
        resource_id=user_id,
        metadata={"email": email},
    )
    return {"resent": True}


@router.delete("/{user_id}/invite", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_invite(user_id: str, tenant: dict = Depends(require_team_admin)) -> Response:
    member = await queries.get_team_member(tenant["id"], user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Teammitglied nicht gefunden")
    if member.get("accepted"):
        raise HTTPException(status_code=409, detail="Angenommene Einladungen können nicht storniert werden")
    if not await queries.delete_team_member(tenant["id"], user_id):
        raise HTTPException(status_code=404, detail="Teammitglied nicht gefunden")
    await record_audit_event(
        tenant,
        action="team.invite_cancelled",
        resource_type="team_member",
        resource_id=user_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(user_id: str, tenant: dict = Depends(require_team_admin)) -> Response:
    member = None
    with suppress(Exception):
        member = await queries.get_team_member(tenant["id"], user_id)
    if member and member.get("role") == "owner":
        owners = await queries.count_owner_members(tenant["id"])
        if owners <= 1:
            raise HTTPException(status_code=409, detail="Der letzte Owner kann nicht entfernt werden")
    if not await queries.delete_team_member(tenant["id"], user_id):
        raise HTTPException(status_code=404, detail="Teammitglied nicht gefunden")
    await record_audit_event(
        tenant,
        action="team.member_removed",
        resource_type="team_member",
        resource_id=user_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
