"""Alert delivery channels.

Revision ID: 0005_alert_channels
Revises: 0004_api_keys
Create Date: 2026-06-29
"""

from alembic import op


revision = "0005_alert_channels"
down_revision = "0004_api_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        create table if not exists public.alert_channels (
          id          uuid primary key default gen_random_uuid(),
          tenant_id   uuid not null references public.tenants(id) on delete cascade,
          type        text not null check (type in ('email','webhook','slack')),
          config      jsonb not null,
          active      boolean not null default true,
          created_at  timestamptz not null default now()
        );
        alter table public.alert_channels enable row level security;
        create policy "alert_channels: own tenant" on public.alert_channels
          for all using (tenant_id = public.my_tenant_id())
          with check (tenant_id = public.my_tenant_id());
        grant select, insert, update, delete on public.alert_channels to authenticated;
        grant all on public.alert_channels to service_role;
        """
    )


def downgrade() -> None:
    op.execute("drop table if exists public.alert_channels cascade;")
