"""Team members.

Revision ID: 0006_team_members
Revises: 0005_alert_channels
Create Date: 2026-06-29
"""

from alembic import op


revision = "0006_team_members"
down_revision = "0005_alert_channels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        create table if not exists public.team_members (
          id          uuid primary key default gen_random_uuid(),
          tenant_id   uuid not null references public.tenants(id) on delete cascade,
          user_id     uuid not null references auth.users(id) on delete cascade,
          role        text not null default 'member' check (role in ('owner','admin','member')),
          invited_at  timestamptz not null default now(),
          accepted    boolean not null default false,
          unique (tenant_id, user_id)
        );
        alter table public.team_members enable row level security;
        create policy "team_members: own tenant" on public.team_members
          for all using (tenant_id = public.my_tenant_id())
          with check (tenant_id = public.my_tenant_id());
        grant select, insert, update, delete on public.team_members to authenticated;
        grant all on public.team_members to service_role;
        """
    )


def downgrade() -> None:
    op.execute("drop table if exists public.team_members cascade;")
