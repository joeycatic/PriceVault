"""Enforce tenant consistency across related records.

Revision ID: 0014_tenant_reference_integrity
Revises: 0013_restrict_membership_update
Create Date: 2026-07-01
"""

from alembic import op


revision = "0014_tenant_reference_integrity"
down_revision = "0013_restrict_membership_update"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        alter table public.products
          add constraint products_id_tenant_key unique (id, tenant_id);
        alter table public.competitors
          add constraint competitors_id_tenant_key unique (id, tenant_id);
        alter table public.competitor_products
          add constraint competitor_products_id_tenant_key unique (id, tenant_id);
        alter table public.alerts
          add constraint alerts_id_tenant_key unique (id, tenant_id);

        alter table public.competitor_products
          drop constraint competitor_products_product_id_fkey,
          drop constraint competitor_products_competitor_id_fkey,
          add constraint competitor_products_product_tenant_fkey
            foreign key (product_id, tenant_id)
            references public.products(id, tenant_id) on delete cascade,
          add constraint competitor_products_competitor_tenant_fkey
            foreign key (competitor_id, tenant_id)
            references public.competitors(id, tenant_id) on delete cascade;

        alter table public.price_snapshots
          drop constraint price_snapshots_competitor_product_id_fkey,
          add constraint price_snapshots_mapping_tenant_fkey
            foreign key (competitor_product_id, tenant_id)
            references public.competitor_products(id, tenant_id) on delete cascade;

        alter table public.alerts
          drop constraint alerts_product_id_fkey,
          drop constraint alerts_competitor_id_fkey,
          add constraint alerts_product_tenant_fkey
            foreign key (product_id, tenant_id)
            references public.products(id, tenant_id) on delete cascade,
          add constraint alerts_competitor_tenant_fkey
            foreign key (competitor_id, tenant_id)
            references public.competitors(id, tenant_id) on delete cascade;

        alter table public.alert_events
          drop constraint alert_events_alert_id_fkey,
          drop constraint alert_events_competitor_product_id_fkey,
          add constraint alert_events_alert_tenant_fkey
            foreign key (alert_id, tenant_id)
            references public.alerts(id, tenant_id) on delete cascade,
          add constraint alert_events_mapping_tenant_fkey
            foreign key (competitor_product_id, tenant_id)
            references public.competitor_products(id, tenant_id);

        alter table public.scrape_failures
          drop constraint scrape_failures_product_id_fkey,
          drop constraint scrape_failures_competitor_product_id_fkey,
          add constraint scrape_failures_product_tenant_fkey
            foreign key (product_id, tenant_id)
            references public.products(id, tenant_id) on delete cascade,
          add constraint scrape_failures_mapping_tenant_fkey
            foreign key (competitor_product_id, tenant_id)
            references public.competitor_products(id, tenant_id) on delete cascade;

        notify pgrst, 'reload schema';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        alter table public.scrape_failures
          drop constraint scrape_failures_product_tenant_fkey,
          drop constraint scrape_failures_mapping_tenant_fkey,
          add constraint scrape_failures_product_id_fkey
            foreign key (product_id) references public.products(id) on delete cascade,
          add constraint scrape_failures_competitor_product_id_fkey
            foreign key (competitor_product_id)
            references public.competitor_products(id) on delete cascade;

        alter table public.alert_events
          drop constraint alert_events_alert_tenant_fkey,
          drop constraint alert_events_mapping_tenant_fkey,
          add constraint alert_events_alert_id_fkey
            foreign key (alert_id) references public.alerts(id) on delete cascade,
          add constraint alert_events_competitor_product_id_fkey
            foreign key (competitor_product_id) references public.competitor_products(id);

        alter table public.alerts
          drop constraint alerts_product_tenant_fkey,
          drop constraint alerts_competitor_tenant_fkey,
          add constraint alerts_product_id_fkey
            foreign key (product_id) references public.products(id) on delete cascade,
          add constraint alerts_competitor_id_fkey
            foreign key (competitor_id) references public.competitors(id) on delete cascade;

        alter table public.price_snapshots
          drop constraint price_snapshots_mapping_tenant_fkey,
          add constraint price_snapshots_competitor_product_id_fkey
            foreign key (competitor_product_id)
            references public.competitor_products(id) on delete cascade;

        alter table public.competitor_products
          drop constraint competitor_products_product_tenant_fkey,
          drop constraint competitor_products_competitor_tenant_fkey,
          add constraint competitor_products_product_id_fkey
            foreign key (product_id) references public.products(id) on delete cascade,
          add constraint competitor_products_competitor_id_fkey
            foreign key (competitor_id) references public.competitors(id) on delete cascade;

        alter table public.alerts drop constraint alerts_id_tenant_key;
        alter table public.competitor_products
          drop constraint competitor_products_id_tenant_key;
        alter table public.competitors drop constraint competitors_id_tenant_key;
        alter table public.products drop constraint products_id_tenant_key;

        notify pgrst, 'reload schema';
        """
    )
