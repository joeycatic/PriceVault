-- PriceVault customer-readiness additive upgrade for existing Supabase projects.
-- Authoritative fresh-install definitions remain in backend/db/schema.sql.
-- Safe to re-run; review the companion runbook before execution.
begin;

create sequence if not exists public.billing_adjustment_number_seq;
alter table public.billing_invoices
  add column if not exists tenant_reference uuid,
  add column if not exists tax_evidence jsonb not null default '{}'::jsonb,
  add column if not exists invoice_state text not null default 'issued';
update public.billing_invoices set tenant_reference = tenant_id where tenant_reference is null;
alter table public.billing_invoices alter column tenant_reference set not null;
create table if not exists public.billing_adjustments (
  id uuid primary key default gen_random_uuid(), tenant_reference uuid not null,
  invoice_id uuid not null references public.billing_invoices(id) on delete restrict,
  type text not null, adjustment_number text not null unique, provider_transaction_id text,
  amount_cents integer not null check (amount_cents > 0), reason text not null,
  evidence jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create unique index if not exists billing_adjustments_provider_type_uidx
  on public.billing_adjustments (provider_transaction_id, type) where provider_transaction_id is not null;

alter table public.competitor_products
  add column if not exists expected_currency text,
  add column if not exists expected_variant text,
  add column if not exists validation_state text not null default 'unvalidated',
  add column if not exists validation_notes text;
alter table public.price_snapshots
  add column if not exists price_type text not null default 'unknown',
  add column if not exists vat_status text not null default 'unknown',
  add column if not exists shipping_status text not null default 'unknown',
  add column if not exists variant_evidence text,
  add column if not exists extraction_method text not null default 'unknown',
  add column if not exists confidence numeric(5,4) not null default 0,
  add column if not exists source_evidence jsonb not null default '{}'::jsonb,
  add column if not exists validation_state text not null default 'unknown',
  add column if not exists validation_reason text;
update public.price_snapshots set
  price_type = coalesce(price_type, 'unknown'),
  vat_status = coalesce(vat_status, 'unknown'),
  shipping_status = coalesce(shipping_status, 'unknown'),
  extraction_method = coalesce(extraction_method, 'unknown'),
  validation_state = coalesce(validation_state, 'unknown'),
  confidence = coalesce(confidence, 0);

alter table public.tenants add column if not exists automatic_repricing_suspended boolean not null default false;
alter table public.product_events add column if not exists dedupe_key text not null default 'once';
delete from public.product_events older
using public.product_events newer
where older.tenant_id = newer.tenant_id and older.event_name = newer.event_name
  and older.dedupe_key = newer.dedupe_key and older.occurred_at > newer.occurred_at;
create unique index if not exists product_events_tenant_event_dedupe_idx
  on public.product_events (tenant_id, event_name, dedupe_key);
alter table public.repricing_changes add column if not exists rollback_state text not null default 'available';
alter table public.privacy_requests
  add column if not exists scheduled_for timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists processor_status jsonb not null default '{}'::jsonb,
  add column if not exists backup_expiry_status text,
  add column if not exists completion_receipt jsonb not null default '{}'::jsonb,
  add column if not exists receipt_email text,
  add column if not exists completed_at timestamptz;

create table if not exists public.billing_refund_requests (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete set null, tenant_reference uuid not null,
  invoice_id uuid not null references public.billing_invoices(id) on delete restrict, requested_by uuid not null,
  amount_cents integer not null check (amount_cents > 0), reason text not null,
  status text not null default 'requested' check (status in ('requested','approved','processing','succeeded','rejected','failed')),
  idempotency_key text not null unique, provider_transaction_id text, provider_response jsonb not null default '{}'::jsonb,
  decision_reason text, decided_by uuid, requested_at timestamptz not null default now(), decided_at timestamptz, processed_at timestamptz
);
create table if not exists public.public_incidents (
  id uuid primary key default gen_random_uuid(), title text not null, message text not null,
  status text not null, severity text not null, affected_services jsonb not null default '[]'::jsonb,
  started_at timestamptz not null, resolved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.csp_violation_reports (
  id uuid primary key default gen_random_uuid(), document_origin text, violated_directive text not null,
  effective_directive text, blocked_origin text, source_origin text, disposition text, status_code integer,
  received_at timestamptz not null default now()
);
create table if not exists public.capacity_evaluations (
  id uuid primary key default gen_random_uuid(), window_started_at timestamptz not null, window_ended_at timestamptz not null,
  metric text not null, utilization numeric(6,4) not null, state text not null,
  notification_status text not null default 'not_required', evidence jsonb not null default '{}'::jsonb,
  unique (window_started_at, metric)
);
create table if not exists public.backup_verifications (
  id uuid primary key default gen_random_uuid(), provider text not null default 'supabase', backup_observed_at timestamptz not null,
  evidence_location text not null, verified_by text not null, status text not null, created_at timestamptz not null default now()
);
create table if not exists public.privacy_deletion_receipts (
  id uuid primary key default gen_random_uuid(), tenant_reference uuid not null, request_reference uuid not null unique,
  audit_receipt jsonb not null, processor_status jsonb not null default '{}'::jsonb,
  backup_expiry_status text not null default 'pending_expiry', recipient_email text,
  delivery_status text not null default 'pending', delivery_attempts integer not null default 0,
  last_delivery_error text, delivered_at timestamptz, erase_recipient_at timestamptz, completed_at timestamptz not null default now()
);

alter table public.billing_refund_requests enable row level security;
alter table public.public_incidents enable row level security;
alter table public.csp_violation_reports enable row level security;
alter table public.capacity_evaluations enable row level security;
alter table public.backup_verifications enable row level security;
alter table public.privacy_deletion_receipts enable row level security;

do $$ begin
  create policy "billing_refund_requests: tenant owner read" on public.billing_refund_requests
    for select using (tenant_id = public.my_tenant_id() and exists (select 1 from public.tenants where id = tenant_id and user_id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "billing_refund_requests: tenant owner insert" on public.billing_refund_requests
    for insert with check (tenant_id = public.my_tenant_id() and requested_by = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public_incidents: public read" on public.public_incidents for select using (true);
exception when duplicate_object then null; end $$;

grant select, insert on public.billing_refund_requests to authenticated;
grant select on public.public_incidents to anon, authenticated;
grant all on public.billing_refund_requests, public.public_incidents, public.csp_violation_reports,
  public.capacity_evaluations, public.backup_verifications, public.privacy_deletion_receipts to service_role;

commit;
notify pgrst, 'reload schema';
