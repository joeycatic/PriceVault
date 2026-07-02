"""Allow invited team members to resolve their tenant safely.

Revision ID: 0008_team_member_access
Revises: 0007_connector_sources
Create Date: 2026-06-30
"""

from alembic import op


revision = "0008_team_member_access"
down_revision = "0007_connector_sources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        create or replace function public.my_tenant_id()
        returns uuid
        language sql
        stable
        security definer
        set search_path = public
        set row_security = off
        as $$
          select tenant_id
          from (
            select id as tenant_id, 0 as priority
            from public.tenants
            where user_id = auth.uid()
            union all
            select tenant_id, 1 as priority
            from public.team_members
            where user_id = auth.uid()
          ) memberships
          order by priority
          limit 1;
        $$;
        revoke all on function public.my_tenant_id() from public;
        grant execute on function public.my_tenant_id() to authenticated, service_role;

        drop policy if exists "tenant: own row" on public.tenants;
        create policy "tenants: visible membership" on public.tenants
          for select using (id = public.my_tenant_id());
        create policy "tenants: owner insert" on public.tenants
          for insert with check (user_id = auth.uid());
        create policy "tenants: owner update" on public.tenants
          for update using (user_id = auth.uid())
          with check (user_id = auth.uid());
        create policy "tenants: owner delete" on public.tenants
          for delete using (user_id = auth.uid());

        drop policy if exists "team_members: own tenant" on public.team_members;
        create policy "team_members: visible membership" on public.team_members
          for select using (tenant_id = public.my_tenant_id());
        create policy "team_members: accept own invite" on public.team_members
          for update using (user_id = auth.uid())
          with check (user_id = auth.uid() and tenant_id = public.my_tenant_id());
        revoke insert, update, delete on public.team_members from authenticated;
        grant update (accepted) on public.team_members to authenticated;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        drop policy if exists "team_members: visible membership" on public.team_members;
        drop policy if exists "team_members: accept own invite" on public.team_members;
        revoke update (accepted) on public.team_members from authenticated;
        grant insert, update, delete on public.team_members to authenticated;
        create policy "team_members: own tenant" on public.team_members
          for all using (tenant_id = public.my_tenant_id())
          with check (tenant_id = public.my_tenant_id());

        drop policy if exists "tenants: visible membership" on public.tenants;
        drop policy if exists "tenants: owner insert" on public.tenants;
        drop policy if exists "tenants: owner update" on public.tenants;
        drop policy if exists "tenants: owner delete" on public.tenants;

        create or replace function public.my_tenant_id()
        returns uuid language sql stable security invoker set search_path = public as $$
          select id from public.tenants where user_id = auth.uid() limit 1;
        $$;
        create policy "tenant: own row" on public.tenants
          for all using (user_id = auth.uid())
          with check (user_id = auth.uid());
        """
    )
