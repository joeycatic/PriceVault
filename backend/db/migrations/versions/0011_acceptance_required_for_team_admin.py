"""Require accepted membership for team admin RLS privileges.

Revision ID: 0011_acceptance_required_for_team_admin
Revises: 0010_integration_admin_rls
Create Date: 2026-07-01
"""

from alembic import op


revision = "0011_acceptance_required_for_team_admin"
down_revision = "0010_integration_admin_rls"
branch_labels = None
depends_on = None


CAN_MANAGE_TEAM_SQL = """
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
      and accepted = true
  );
$$;
revoke all on function public.can_manage_team(uuid) from public;
grant execute on function public.can_manage_team(uuid) to authenticated, service_role;
"""


def upgrade() -> None:
    # Alembic defaults version_num to VARCHAR(32); later descriptive IDs are longer.
    op.execute("alter table alembic_version alter column version_num type varchar(64)")
    op.execute(CAN_MANAGE_TEAM_SQL)


def downgrade() -> None:
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
        """
    )
