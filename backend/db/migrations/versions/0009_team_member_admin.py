"""Allow team admins to manage seats through RLS.

Revision ID: 0009_team_member_admin
Revises: 0008_team_member_access
Create Date: 2026-07-01
"""

from alembic import op


revision = "0009_team_member_admin"
down_revision = "0008_team_member_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        create or replace function public.can_manage_team(target_tenant_id uuid)
        returns boolean
        language sql
        stable
        security definer
        set search_path = public
        set row_security = off
        as $$
          select exists (
            select 1
            from public.tenants
            where id = target_tenant_id
              and user_id = auth.uid()
          )
          or exists (
            select 1
            from public.team_members
            where tenant_id = target_tenant_id
              and user_id = auth.uid()
              and role in ('owner', 'admin')
          );
        $$;
        revoke all on function public.can_manage_team(uuid) from public;
        grant execute on function public.can_manage_team(uuid) to authenticated, service_role;

        create policy "team_members: admin insert" on public.team_members
          for insert with check (public.can_manage_team(tenant_id));
        create policy "team_members: admin delete" on public.team_members
          for delete using (public.can_manage_team(tenant_id));

        grant insert (tenant_id, user_id, role, accepted) on public.team_members to authenticated;
        grant delete on public.team_members to authenticated;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        drop policy if exists "team_members: admin insert" on public.team_members;
        drop policy if exists "team_members: admin delete" on public.team_members;
        revoke insert (tenant_id, user_id, role, accepted) on public.team_members from authenticated;
        revoke delete on public.team_members from authenticated;
        drop function if exists public.can_manage_team(uuid);
        """
    )
