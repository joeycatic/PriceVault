"""Replace Stripe-specific billing state with Viva subscriptions.

Revision ID: 0015_viva_billing
Revises: 0014_tenant_reference_integrity
Create Date: 2026-07-02
"""

from alembic import op


revision = "0015_viva_billing"
down_revision = "0014_tenant_reference_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        alter table public.tenants
          add column if not exists billing_provider text,
          add column if not exists viva_initial_transaction_id uuid,
          add column if not exists viva_source_code text,
          add column if not exists subscription_status text not null default 'inactive',
          add column if not exists subscription_plan text,
          add column if not exists subscription_current_period_end timestamptz;

        alter table public.tenants
          add constraint tenants_billing_provider_check
            check (billing_provider is null or billing_provider = 'viva'),
          add constraint tenants_subscription_status_check
            check (subscription_status in ('inactive','active','past_due','canceled')),
          add constraint tenants_subscription_plan_check
            check (subscription_plan is null or subscription_plan in ('pro','agency'));

        create index if not exists idx_tenants_viva_renewals
          on public.tenants(subscription_current_period_end)
          where billing_provider = 'viva' and subscription_status = 'active';

        create table public.billing_orders (
          id              uuid primary key default gen_random_uuid(),
          tenant_id       uuid not null references public.tenants(id) on delete cascade,
          provider        text not null default 'viva' check (provider = 'viva'),
          order_code      bigint not null unique,
          plan            text not null check (plan in ('pro','agency')),
          amount_cents    integer not null check (amount_cents > 0),
          status          text not null default 'pending'
                            check (status in ('pending','paid','failed','canceled')),
          transaction_id  uuid unique,
          created_at      timestamptz not null default now(),
          paid_at         timestamptz
        );

        alter table public.billing_orders enable row level security;
        create policy "billing_orders: tenant owner read" on public.billing_orders
          for select using (
            tenant_id = public.my_tenant_id()
            and exists (
              select 1 from public.tenants
              where tenants.id = billing_orders.tenant_id
                and tenants.user_id = auth.uid()
            )
          );
        create policy "billing_orders: tenant owner insert" on public.billing_orders
          for insert with check (
            tenant_id = public.my_tenant_id()
            and exists (
              select 1 from public.tenants
              where tenants.id = billing_orders.tenant_id
                and tenants.user_id = auth.uid()
            )
          );
        grant select on public.billing_orders to authenticated;
        grant insert (tenant_id, order_code, plan, amount_cents)
          on public.billing_orders to authenticated;
        grant all on public.billing_orders to service_role;

        alter table public.tenants
          drop column if exists stripe_customer_id,
          drop column if exists stripe_subscription_id;

        notify pgrst, 'reload schema';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        drop table if exists public.billing_orders cascade;
        drop index if exists public.idx_tenants_viva_renewals;
        alter table public.tenants
          drop constraint if exists tenants_billing_provider_check,
          drop constraint if exists tenants_subscription_status_check,
          drop constraint if exists tenants_subscription_plan_check,
          drop column if exists billing_provider,
          drop column if exists viva_initial_transaction_id,
          drop column if exists viva_source_code,
          drop column if exists subscription_status,
          drop column if exists subscription_plan,
          drop column if exists subscription_current_period_end,
          add column stripe_customer_id text,
          add column stripe_subscription_id text;
        create index idx_tenants_stripe_subscription
          on public.tenants(stripe_subscription_id)
          where stripe_subscription_id is not null;
        notify pgrst, 'reload schema';
        """
    )
