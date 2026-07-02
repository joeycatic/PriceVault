"""Scrape dead-letter queue.

Revision ID: 0003_dlq
Revises: 0002_billing
Create Date: 2026-06-29
"""

from alembic import op


revision = "0003_dlq"
down_revision = "0002_billing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        create table if not exists public.scrape_failures (
          id                    uuid primary key default gen_random_uuid(),
          tenant_id             uuid not null references public.tenants(id) on delete cascade,
          product_id            uuid references public.products(id) on delete cascade,
          competitor_product_id uuid references public.competitor_products(id) on delete cascade,
          error                 text not null,
          attempts              int not null default 1,
          created_at            timestamptz not null default now()
        );
        alter table public.scrape_failures enable row level security;
        create policy "scrape_failures: own tenant" on public.scrape_failures
          for all using (tenant_id = public.my_tenant_id())
          with check (tenant_id = public.my_tenant_id());
        grant select on public.scrape_failures to authenticated;
        grant all on public.scrape_failures to service_role;
        """
    )


def downgrade() -> None:
    op.execute("drop table if exists public.scrape_failures cascade;")
