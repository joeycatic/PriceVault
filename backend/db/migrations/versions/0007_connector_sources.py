"""Connector sources.

Revision ID: 0007_connector_sources
Revises: 0006_team_members
Create Date: 2026-06-29
"""

from alembic import op


revision = "0007_connector_sources"
down_revision = "0006_team_members"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        create table if not exists public.connector_sources (
          id          uuid primary key default gen_random_uuid(),
          tenant_id   uuid not null references public.tenants(id) on delete cascade,
          type        text not null check (type in ('shopify','woocommerce')),
          name        text not null,
          config      jsonb not null,
          active      boolean not null default true,
          created_at  timestamptz not null default now()
        );
        alter table public.connector_sources enable row level security;
        create policy "connector_sources: own tenant" on public.connector_sources
          for all using (tenant_id = public.my_tenant_id())
          with check (tenant_id = public.my_tenant_id());
        grant select, insert, update, delete on public.connector_sources to authenticated;
        grant all on public.connector_sources to service_role;
        notify pgrst, 'reload schema';
        """
    )


def downgrade() -> None:
    op.execute("drop table if exists public.connector_sources cascade;")
