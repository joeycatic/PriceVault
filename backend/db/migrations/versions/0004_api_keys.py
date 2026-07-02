"""API keys.

Revision ID: 0004_api_keys
Revises: 0003_dlq
Create Date: 2026-06-29
"""

from alembic import op


revision = "0004_api_keys"
down_revision = "0003_dlq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        create table if not exists public.api_keys (
          id          uuid primary key default gen_random_uuid(),
          tenant_id   uuid not null references public.tenants(id) on delete cascade,
          key_prefix   text not null,
          key_hash    text not null unique,
          name        text not null,
          created_at  timestamptz not null default now(),
          last_used   timestamptz,
          revoked     boolean not null default false
        );
        create index if not exists idx_api_keys_prefix
          on public.api_keys(key_prefix)
          where revoked = false;
        alter table public.api_keys enable row level security;
        create policy "api_keys: own tenant" on public.api_keys
          for all using (tenant_id = public.my_tenant_id())
          with check (tenant_id = public.my_tenant_id());
        grant select (id, tenant_id, name, created_at, last_used, revoked)
          on public.api_keys to authenticated;
        grant insert (id, tenant_id, key_prefix, key_hash, name)
          on public.api_keys to authenticated;
        grant update (revoked)
          on public.api_keys to authenticated;
        grant all on public.api_keys to service_role;
        """
    )


def downgrade() -> None:
    op.execute("drop table if exists public.api_keys cascade;")
