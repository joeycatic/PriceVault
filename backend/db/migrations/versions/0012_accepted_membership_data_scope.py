"""Limit tenant data scope to accepted team memberships.

Revision ID: 0012_accepted_membership_data_scope
Revises: 0011_acceptance_required_for_team_admin
Create Date: 2026-07-01
"""

from alembic import op


revision = "0012_accepted_membership_data_scope"
down_revision = "0011_acceptance_required_for_team_admin"
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
              and accepted = true
          ) memberships
          order by priority
          limit 1;
        $$;
        revoke all on function public.my_tenant_id() from public;
        grant execute on function public.my_tenant_id() to authenticated, service_role;

        drop policy if exists "tenants: visible membership" on public.tenants;
        create policy "tenants: visible membership" on public.tenants
          for select using (
            user_id = auth.uid()
            or exists (
              select 1
              from public.team_members
              where tenant_id = public.tenants.id
                and user_id = auth.uid()
            )
          );

        drop policy if exists "team_members: visible membership" on public.team_members;
        create policy "team_members: visible membership" on public.team_members
          for select using (
            tenant_id = public.my_tenant_id()
            or user_id = auth.uid()
          );

        drop policy if exists "team_members: accept own invite" on public.team_members;
        create policy "team_members: accept own invite" on public.team_members
          for update using (user_id = auth.uid())
          with check (user_id = auth.uid());

        notify pgrst, 'reload schema';
        """
    )


def downgrade() -> None:
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

        drop policy if exists "tenants: visible membership" on public.tenants;
        create policy "tenants: visible membership" on public.tenants
          for select using (id = public.my_tenant_id());

        drop policy if exists "team_members: visible membership" on public.team_members;
        create policy "team_members: visible membership" on public.team_members
          for select using (tenant_id = public.my_tenant_id());

        drop policy if exists "team_members: accept own invite" on public.team_members;
        create policy "team_members: accept own invite" on public.team_members
          for update using (user_id = auth.uid())
          with check (user_id = auth.uid() and tenant_id = public.my_tenant_id());

        notify pgrst, 'reload schema';
        """
    )
