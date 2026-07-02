"""Billing plan fields.

Revision ID: 0002_billing
Revises: 0001_initial
Create Date: 2026-06-29
"""

from alembic import op


revision = "0002_billing"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        alter table public.tenants
          drop constraint if exists tenants_plan_check;
        alter table public.tenants
          alter column plan set default 'free';
        update public.tenants set plan = 'free' where plan = 'trial';
        update public.tenants set plan = 'pro' where plan = 'starter';
        alter table public.tenants
          add constraint tenants_plan_check check (plan in ('free','pro','agency'));
        alter table public.tenants
          add column if not exists stripe_customer_id text,
          add column if not exists stripe_subscription_id text;
        create index if not exists idx_tenants_stripe_subscription
          on public.tenants(stripe_subscription_id)
          where stripe_subscription_id is not null;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        alter table public.tenants
          drop constraint if exists tenants_plan_check;
        update public.tenants set plan = 'starter' where plan = 'free';
        update public.tenants set plan = 'pro' where plan = 'agency';
        alter table public.tenants
          alter column plan set default 'trial';
        alter table public.tenants
          add constraint tenants_plan_check check (plan in ('trial','starter','pro'));
        alter table public.tenants
          drop column if exists stripe_customer_id,
          drop column if exists stripe_subscription_id;
        """
    )
