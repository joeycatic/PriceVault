import asyncio

import pytest
from fastapi import HTTPException


class DummyState:
    user_id = "user-1"
    user_email = "admin@example.com"


class DummyRequest:
    state = DummyState()


def test_require_tenant_admin_from_header_fallback_on_missing_metadata(monkeypatch):
    async def run():
        from auth.plan_guard import require_tenant_admin_from_header
        from db import queries

        async def broken_lookup(_tenant_id):
            raise RuntimeError("schema not ready")

        monkeypatch.setattr(queries, "get_tenant_by_id", broken_lookup)
        tenant = await require_tenant_admin_from_header(DummyRequest(), "tenant-1")
        assert tenant["_role"] == "owner"
        assert tenant["_email"] == "admin@example.com"

    asyncio.run(run())


def test_require_tenant_admin_from_header_rejects_missing_or_viewer_membership(monkeypatch):
    async def run():
        from auth.plan_guard import require_tenant_admin_from_header
        from db import queries

        async def tenant_lookup(_tenant_id):
            return {"id": "tenant-1", "user_id": "owner-1"}

        async def no_membership(_tenant_id, _user_id):
            return None

        monkeypatch.setattr(queries, "get_tenant_by_id", tenant_lookup)
        monkeypatch.setattr(queries, "get_team_member", no_membership)
        with pytest.raises(HTTPException) as missing:
            await require_tenant_admin_from_header(DummyRequest(), "tenant-1")
        assert missing.value.status_code == 403

        async def viewer_membership(_tenant_id, _user_id):
            return {"role": "viewer"}

        monkeypatch.setattr(queries, "get_team_member", viewer_membership)
        with pytest.raises(HTTPException) as viewer:
            await require_tenant_admin_from_header(DummyRequest(), "tenant-1")
        assert viewer.value.status_code == 403

    asyncio.run(run())


def test_require_tenant_admin_from_header_accepts_owner_and_admin_member(monkeypatch):
    async def run():
        from auth.plan_guard import require_tenant_admin_from_header
        from db import queries

        async def owner_tenant(_tenant_id):
            return {"id": "tenant-1", "user_id": "user-1"}

        monkeypatch.setattr(queries, "get_tenant_by_id", owner_tenant)
        owner = await require_tenant_admin_from_header(DummyRequest(), "tenant-1")
        assert owner["_role"] == "owner"

        async def member_tenant(_tenant_id):
            return {"id": "tenant-1", "user_id": "owner-1"}

        async def admin_membership(_tenant_id, _user_id):
            return {"role": "admin"}

        monkeypatch.setattr(queries, "get_tenant_by_id", member_tenant)
        monkeypatch.setattr(queries, "get_team_member", admin_membership)
        member = await require_tenant_admin_from_header(DummyRequest(), "tenant-1")
        assert member["_role"] == "admin"

    asyncio.run(run())


def test_role_dependencies_reject_disallowed_roles():
    async def run():
        from auth.plan_guard import require_billing_role, require_owner, require_team_admin, require_tenant_admin

        with pytest.raises(HTTPException):
            await require_tenant_admin({"_role": "viewer"})
        with pytest.raises(HTTPException):
            await require_billing_role({"_role": "viewer"})
        with pytest.raises(HTTPException):
            await require_team_admin({"_role": "viewer", "plan": "agency"})
        with pytest.raises(HTTPException):
            await require_owner({"_role": "admin"})

    asyncio.run(run())


def test_role_dependencies_accept_allowed_roles():
    async def run():
        from auth.plan_guard import require_billing_role, require_tenant_admin

        admin = {"_role": "admin"}
        billing = {"_role": "billing"}
        assert await require_tenant_admin(admin) is admin
        assert await require_billing_role(billing) is billing

    asyncio.run(run())


def test_team_update_member_role_and_last_owner_guard(monkeypatch):
    async def run():
        from db import queries
        from models.schemas import TeamMemberUpdate
        from routers import team

        async def existing(_tenant_id, _user_id):
            return {"role": "admin"}

        async def update(_tenant_id, user_id, values):
            return {"user_id": user_id, **values}

        monkeypatch.setattr(queries, "get_team_member", existing)
        monkeypatch.setattr(queries, "update_team_member", update)
        changed = await team.update_member(
            "user-2",
            TeamMemberUpdate(role="viewer"),
            {"id": "tenant-1"},
        )
        assert changed == {"user_id": "user-2", "role": "viewer"}

        async def owner(_tenant_id, _user_id):
            return {"role": "owner"}

        async def one_owner(_tenant_id):
            return 1

        monkeypatch.setattr(queries, "get_team_member", owner)
        monkeypatch.setattr(queries, "count_owner_members", one_owner)
        with pytest.raises(HTTPException) as blocked:
            await team.update_member("user-2", TeamMemberUpdate(role="admin"), {"id": "tenant-1"})
        assert blocked.value.status_code == 409

    asyncio.run(run())


def test_team_resend_and_cancel_invite_paths(monkeypatch):
    async def run():
        from db import queries
        from routers import team

        sent = []

        class FakeAdmin:
            @staticmethod
            def invite_user_by_email(email, options):
                sent.append((email, options))

        class FakeAuth:
            admin = FakeAdmin()

        class FakeClient:
            auth = FakeAuth()

        async def pending(_tenant_id, _user_id):
            return {"accepted": False, "invite_email": "team@example.com", "role": "analyst"}

        async def delete(_tenant_id, user_id):
            return user_id == "user-2"

        monkeypatch.setattr(queries, "get_team_member", pending)
        monkeypatch.setattr(queries, "delete_team_member", delete)
        monkeypatch.setattr(team, "get_supabase_admin", lambda: FakeClient())

        resent = await team.resend_invite("user-2", {"id": "tenant-1"})
        assert resent == {"resent": True}
        assert sent == [("team@example.com", {"data": {"tenant_id": "tenant-1", "role": "analyst"}})]

        response = await team.cancel_invite("user-2", {"id": "tenant-1"})
        assert response.status_code == 204

    asyncio.run(run())


def test_team_invite_and_remove_error_branches(monkeypatch):
    async def run():
        from db import queries
        from models.schemas import TeamInviteRequest
        from routers import team

        async def full(_tenant_id):
            return [{}, {}, {}, {}, {}]

        monkeypatch.setattr(queries, "list_team_members", full)
        with pytest.raises(HTTPException) as seat_limit:
            await team.invite_member(
                TeamInviteRequest(email="team@example.com"),
                {"id": "tenant-1", "plan": "agency"},
            )
        assert seat_limit.value.status_code == 403

        async def owner(_tenant_id, _user_id):
            return {"role": "owner"}

        async def one_owner(_tenant_id):
            return 1

        monkeypatch.setattr(queries, "get_team_member", owner)
        monkeypatch.setattr(queries, "count_owner_members", one_owner)
        with pytest.raises(HTTPException) as last_owner:
            await team.remove_member("user-2", {"id": "tenant-1"})
        assert last_owner.value.status_code == 409

    asyncio.run(run())
