"""Add public launch surfaces for settings, audit, jobs, reports, and syncs.

Revision ID: 0016_launch_surfaces
Revises: 0015_viva_billing
Create Date: 2026-07-02
"""

from alembic import op


revision = "0016_launch_surfaces"
down_revision = "0015_viva_billing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        alter table public.tenants
          add column if not exists timezone text not null default 'Europe/Berlin',
          add column if not exists locale text not null default 'de-DE',
          add column if not exists default_currency text not null default 'EUR',
          add column if not exists default_scrape_freq_h int not null default 12
            check (default_scrape_freq_h between 1 and 168),
          add column if not exists invoice_email text,
          add column if not exists vat_id text,
          add column if not exists notification_defaults jsonb not null default '{}'::jsonb,
          add column if not exists activation_state jsonb not null default '{}'::jsonb;

        alter table public.team_members
          add column if not exists invite_email text,
          add column if not exists display_name text;
        alter table public.team_members
          drop constraint if exists team_members_role_check,
          add constraint team_members_role_check
            check (role in ('owner','admin','analyst','viewer','billing','member'));

        alter table public.connector_sources
          drop constraint if exists connector_sources_type_check,
          add constraint connector_sources_type_check
            check (type in ('shopify','woocommerce','feed_csv','google_merchant')),
          add column if not exists last_sync_at timestamptz,
          add column if not exists last_sync_status text
            check (last_sync_status is null or last_sync_status in ('queued','running','succeeded','failed'));

        create table if not exists public.audit_events (
          id uuid primary key default gen_random_uuid(),
          tenant_id uuid references public.tenants(id) on delete cascade,
          user_id uuid,
          user_email text,
          action text not null,
          resource_type text not null,
          resource_id text,
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now()
        );
        create index if not exists idx_audit_events_tenant_time
          on public.audit_events(tenant_id, created_at desc);

        create table if not exists public.scrape_jobs (
          id uuid primary key default gen_random_uuid(),
          tenant_id uuid not null references public.tenants(id) on delete cascade,
          competitor_product_id uuid references public.competitor_products(id) on delete set null,
          state text not null default 'queued'
            check (state in ('queued','running','succeeded','failed','retrying')),
          failure_reason text,
          retry_count int not null default 0,
          next_retry_at timestamptz,
          last_successful_price numeric(10,2),
          queued_at timestamptz not null default now(),
          started_at timestamptz,
          finished_at timestamptz
        );
        create index if not exists idx_scrape_jobs_tenant_time
          on public.scrape_jobs(tenant_id, queued_at desc);
        create index if not exists idx_scrape_jobs_mapping_state
          on public.scrape_jobs(competitor_product_id, state, queued_at desc);

        create table if not exists public.report_schedules (
          id uuid primary key default gen_random_uuid(),
          tenant_id uuid not null references public.tenants(id) on delete cascade,
          name text not null,
          cadence text not null check (cadence in ('weekly','monthly')),
          recipients jsonb not null,
          include_csv boolean not null default false,
          filters jsonb not null default '{}'::jsonb,
          active boolean not null default true,
          created_at timestamptz not null default now(),
          last_run_at timestamptz
        );

        create table if not exists public.report_runs (
          id uuid primary key default gen_random_uuid(),
          tenant_id uuid not null references public.tenants(id) on delete cascade,
          schedule_id uuid references public.report_schedules(id) on delete set null,
          status text not null default 'queued'
            check (status in ('queued','running','sent','failed')),
          recipients jsonb not null default '[]'::jsonb,
          include_csv boolean not null default false,
          filters jsonb not null default '{}'::jsonb,
          error text,
          created_at timestamptz not null default now(),
          finished_at timestamptz
        );
        create index if not exists idx_report_runs_tenant_time
          on public.report_runs(tenant_id, created_at desc);

        create table if not exists public.connector_sync_runs (
          id uuid primary key default gen_random_uuid(),
          tenant_id uuid not null references public.tenants(id) on delete cascade,
          connector_id uuid references public.connector_sources(id) on delete set null,
          status text not null default 'queued'
            check (status in ('queued','running','succeeded','failed')),
          items_seen int not null default 0,
          items_imported int not null default 0,
          error text,
          created_at timestamptz not null default now(),
          finished_at timestamptz
        );
        create index if not exists idx_connector_sync_runs_tenant_time
          on public.connector_sync_runs(tenant_id, created_at desc);

        alter table public.audit_events enable row level security;
        alter table public.scrape_jobs enable row level security;
        alter table public.report_schedules enable row level security;
        alter table public.report_runs enable row level security;
        alter table public.connector_sync_runs enable row level security;

        create policy "audit_events: tenant read" on public.audit_events
          for select using (tenant_id = public.my_tenant_id());
        create policy "scrape_jobs: tenant read" on public.scrape_jobs
          for select using (tenant_id = public.my_tenant_id());
        create policy "report_schedules: tenant read" on public.report_schedules
          for select using (tenant_id = public.my_tenant_id());
        create policy "report_runs: tenant read" on public.report_runs
          for select using (tenant_id = public.my_tenant_id());
        create policy "connector_sync_runs: tenant read" on public.connector_sync_runs
          for select using (tenant_id = public.my_tenant_id());

        grant select on public.audit_events, public.scrape_jobs, public.report_schedules,
          public.report_runs, public.connector_sync_runs to authenticated;
        grant all on public.audit_events, public.scrape_jobs, public.report_schedules,
          public.report_runs, public.connector_sync_runs to service_role;

        notify pgrst, 'reload schema';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        drop table if exists public.connector_sync_runs cascade;
        drop table if exists public.report_runs cascade;
        drop table if exists public.report_schedules cascade;
        drop table if exists public.scrape_jobs cascade;
        drop table if exists public.audit_events cascade;
        alter table public.connector_sources
          drop column if exists last_sync_at,
          drop column if exists last_sync_status;
        alter table public.team_members
          drop column if exists invite_email,
          drop column if exists display_name;
        alter table public.tenants
          drop column if exists timezone,
          drop column if exists locale,
          drop column if exists default_currency,
          drop column if exists default_scrape_freq_h,
          drop column if exists invoice_email,
          drop column if exists vat_id,
          drop column if exists notification_defaults,
          drop column if exists activation_state;
        notify pgrst, 'reload schema';
        """
    )
