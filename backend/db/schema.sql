-- ============================================================
-- PriceVault schema v1.0
-- Run in Supabase SQL editor
-- ============================================================

create extension if not exists "pgcrypto";

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  shop_name   text not null,
  shop_url    text not null,
  plan        text not null default 'free' check (plan in ('free', 'pro', 'agency')),
  billing_provider text check (billing_provider is null or billing_provider = 'viva'),
  viva_initial_transaction_id uuid,
  viva_source_code text,
  subscription_status text not null default 'inactive'
    check (subscription_status in ('inactive','active','past_due','canceled')),
  subscription_plan text check (subscription_plan is null or subscription_plan in ('pro','agency')),
  subscription_current_period_end timestamptz,
  subscription_cancel_at_period_end boolean not null default false,
  cancellation_effective_at timestamptz,
  failed_payment_count int not null default 0 check (failed_payment_count >= 0),
  last_payment_error text,
  next_payment_retry_at timestamptz,
  billing_status_metadata jsonb not null default '{}'::jsonb,
  timezone    text not null default 'Europe/Berlin',
  locale      text not null default 'de-DE',
  default_currency text not null default 'EUR',
  default_scrape_freq_h int not null default 12 check (default_scrape_freq_h between 1 and 168),
  invoice_email text,
  vat_id text,
  billing_address jsonb not null default '{}'::jsonb,
  notification_defaults jsonb not null default '{}'::jsonb,
  activation_state jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique(user_id)
);

create index idx_tenants_viva_renewals
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
  failure_reason  text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  failed_at       timestamptz
);

create table public.billing_invoices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  billing_order_id uuid references public.billing_orders(id) on delete set null,
  invoice_number  text not null unique,
  transaction_id  uuid not null unique,
  plan            text not null check (plan in ('pro','agency')),
  net_amount_cents integer not null check (net_amount_cents > 0),
  vat_rate        numeric(5,2) not null default 19.00,
  vat_amount_cents integer not null check (vat_amount_cents >= 0),
  gross_amount_cents integer not null check (gross_amount_cents > 0),
  currency        text not null default 'EUR',
  seller_snapshot jsonb not null,
  customer_snapshot jsonb not null,
  issued_at       timestamptz not null default now(),
  paid_at         timestamptz not null,
  created_at      timestamptz not null default now()
);

create table public.competitors (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  shop_name       text not null,
  base_url        text not null,
  selector_price  text,
  selector_stock  text,
  scrape_freq_h   int not null default 12 check (scrape_freq_h between 1 and 168),
  active          boolean not null default true,
  notes           text,
  last_scraped_at timestamptz,
  created_at      timestamptz not null default now()
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null,
  our_sku         text,
  our_price       numeric(10,2) check (our_price is null or our_price >= 0),
  our_currency    text not null default 'EUR',
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table public.product_variants (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  name            text not null default 'Standard',
  sku             text,
  gtin            text,
  attributes      jsonb not null default '{}'::jsonb,
  external_refs   jsonb not null default '{}'::jsonb,
  our_price       numeric(10,2) check (our_price is null or our_price >= 0),
  cost_price      numeric(10,2) check (cost_price is null or cost_price >= 0),
  currency        text not null default 'EUR',
  is_default      boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create unique index idx_product_variants_default
  on public.product_variants(product_id) where is_default = true;
create unique index idx_product_variants_tenant_gtin
  on public.product_variants(tenant_id, gtin) where gtin is not null;
create unique index idx_product_variants_tenant_sku
  on public.product_variants(tenant_id, sku) where sku is not null;

create table public.competitor_products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_id      uuid references public.product_variants(id) on delete cascade,
  competitor_id   uuid not null references public.competitors(id) on delete cascade,
  competitor_url  text not null,
  competitor_sku  text,
  selector_price  text,
  active          boolean not null default true,
  health_status   text not null default 'healthy'
                    check (health_status in ('healthy','degraded','broken')),
  consecutive_failures int not null default 0 check (consecutive_failures >= 0),
  last_failure_at timestamptz,
  last_failure_reason text,
  last_successful_scrape_at timestamptz,
  broken_reason   text,
  repaired_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique(variant_id, competitor_id)
);

create table public.match_suggestions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_id      uuid not null references public.product_variants(id) on delete cascade,
  competitor_id   uuid not null references public.competitors(id) on delete cascade,
  candidate_url   text not null,
  candidate_title text not null,
  confidence      numeric(5,4) not null check (confidence between 0 and 1),
  match_method    text not null check (match_method in ('gtin','fuzzy')),
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  mapping_id      uuid references public.competitor_products(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique(variant_id, competitor_id, candidate_url)
);

create table public.repricing_rules (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null,
  strategy        text not null check (strategy in ('match_lowest','beat_percent')),
  beat_by_pct     numeric(6,2) not null default 0 check (beat_by_pct between 0 and 50),
  min_margin_pct  numeric(6,2) not null check (min_margin_pct between 0 and 500),
  product_id      uuid references public.products(id) on delete cascade,
  variant_id      uuid references public.product_variants(id) on delete cascade,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  check (strategy = 'beat_percent' or beat_by_pct = 0)
);

create table public.reprice_suggestions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  rule_id         uuid not null references public.repricing_rules(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_id      uuid not null references public.product_variants(id) on delete cascade,
  previous_price  numeric(10,2),
  lowest_competitor_price numeric(10,2) not null,
  margin_floor    numeric(10,2) not null,
  suggested_price numeric(10,2) not null check (suggested_price >= 0),
  status          text not null default 'pending' check (status in ('pending','approved','rejected','applied','failed')),
  reviewed_by     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  applied_at      timestamptz,
  writeback_status text not null default 'pending' check (writeback_status in ('pending','local_only','succeeded','failed')),
  writeback_error text,
  created_at      timestamptz not null default now()
);

create table public.product_insights (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_id      uuid not null references public.product_variants(id) on delete cascade,
  state_fingerprint text not null,
  commentary      text not null,
  corridor_min    numeric(10,2) not null,
  corridor_max    numeric(10,2) not null,
  corridor_reason text not null,
  model           text not null,
  source_payload  jsonb not null default '{}'::jsonb,
  generated_at    timestamptz not null default now(),
  unique(variant_id, state_fingerprint),
  check (corridor_min >= 0 and corridor_max >= corridor_min)
);

create unique index idx_reprice_suggestions_one_pending
  on public.reprice_suggestions(variant_id) where status = 'pending';

create index idx_match_suggestions_tenant_status
  on public.match_suggestions(tenant_id, status, created_at desc);

create table public.price_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  price                 numeric(10,2),
  currency              text default 'EUR',
  in_stock              boolean,
  raw_price_text        text,
  scrape_ok             boolean not null default true,
  error_msg             text,
  scraped_at            timestamptz not null default now()
);

create index idx_snapshots_cp_time
  on public.price_snapshots(competitor_product_id, scraped_at desc);

create table public.alerts (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  product_id            uuid references public.products(id) on delete cascade,
  competitor_id         uuid references public.competitors(id) on delete cascade,
  condition             text not null check (condition in ('below_pct', 'above_pct', 'below_abs', 'above_abs', 'out_of_stock', 'back_in_stock', 'undercut_abs', 'price_drop', 'price_rise', 'source_broken')),
  threshold             numeric(10,2),
  threshold_unit        text not null default 'percent' check (threshold_unit in ('percent','absolute')),
  notify_email          text not null,
  active                boolean not null default true,
  last_triggered_at     timestamptz,
  cooldown_h            int not null default 24 check (cooldown_h between 1 and 720),
  created_at            timestamptz not null default now(),
  check (
    (condition in ('out_of_stock', 'back_in_stock') and threshold is null)
    or (condition not in ('out_of_stock', 'back_in_stock') and threshold > 0)
  )
);

create table public.alert_events (
  id                    uuid primary key default gen_random_uuid(),
  alert_id              uuid not null references public.alerts(id) on delete cascade,
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  competitor_product_id uuid references public.competitor_products(id),
  our_price             numeric(10,2),
  competitor_price      numeric(10,2),
  previous_competitor_price numeric(10,2),
  previous_in_stock     boolean,
  delta_pct             numeric(6,2),
  email_sent            boolean not null default false,
  trigger_reason        text,
  triggered_at          timestamptz not null default now()
);

create table public.alert_digest_runs (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  digest_date           date not null,
  recipient             text not null,
  status                text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  event_count           int not null default 0 check (event_count >= 0),
  error                 text,
  started_at            timestamptz,
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),
  unique(tenant_id, digest_date)
);

create table public.scrape_failures (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  product_id            uuid references public.products(id) on delete cascade,
  competitor_product_id uuid references public.competitor_products(id) on delete cascade,
  error                 text not null,
  attempts              int not null default 1,
  created_at            timestamptz not null default now()
);

create table public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  key_prefix   text not null,
  key_hash    text not null unique,
  name        text not null,
  created_at  timestamptz not null default now(),
  last_used   timestamptz,
  revoked     boolean not null default false
);

create index idx_api_keys_prefix
  on public.api_keys(key_prefix)
  where revoked = false;

create table public.alert_channels (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  type        text not null check (type in ('email','webhook','slack')),
  config      jsonb not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.alert_channel_deliveries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  alert_event_id  uuid references public.alert_events(id) on delete cascade,
  channel_id      uuid references public.alert_channels(id) on delete set null,
  channel_type    text not null check (channel_type in ('email','webhook','slack')),
  status          text not null default 'queued'
                    check (status in ('queued','running','succeeded','failed')),
  attempt_count   int not null default 0 check (attempt_count >= 0),
  payload         jsonb not null default '{}'::jsonb,
  last_error      text,
  next_retry_at   timestamptz,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz
);

create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','analyst','viewer','billing','member')),
  invite_email text,
  display_name text,
  invited_at  timestamptz not null default now(),
  accepted    boolean not null default false,
  unique (tenant_id, user_id)
);

create table public.connector_sources (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  type        text not null check (type in ('shopify','woocommerce','feed_csv','google_merchant')),
  name        text not null,
  config      jsonb not null,
  provider_details jsonb not null default '{}'::jsonb,
  credential_metadata jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status is null or last_sync_status in ('queued','running','succeeded','failed')),
  last_sync_error text,
  items_seen int not null default 0 check (items_seen >= 0),
  items_imported int not null default 0 check (items_imported >= 0),
  items_updated int not null default 0 check (items_updated >= 0),
  items_failed int not null default 0 check (items_failed >= 0),
  created_at  timestamptz not null default now()
);

create table public.audit_events (
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

create table public.scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  competitor_product_id uuid references public.competitor_products(id) on delete set null,
  state text not null default 'queued' check (state in ('queued','running','succeeded','failed','retrying')),
  failure_reason text,
  retry_count int not null default 0,
  next_retry_at timestamptz,
  last_successful_price numeric(10,2),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  cadence text not null check (cadence in ('weekly','monthly')),
  recipients jsonb not null,
  include_csv boolean not null default false,
  filters jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_run_at timestamptz,
  next_run_at timestamptz
);

create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  schedule_id uuid references public.report_schedules(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','sent','failed')),
  recipients jsonb not null default '[]'::jsonb,
  include_csv boolean not null default false,
  filters jsonb not null default '{}'::jsonb,
  error text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  delivery_error text,
  artifact_metadata jsonb not null default '{}'::jsonb,
  generated_summary text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.connector_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_id uuid references public.connector_sources(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  items_seen int not null default 0,
  items_imported int not null default 0,
  items_updated int not null default 0,
  items_failed int not null default 0,
  error text,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid,
  request_type text not null check (request_type in ('export','deletion')),
  status text not null default 'requested'
    check (status in ('requested','confirmed','processing','completed','canceled')),
  confirmation_text text,
  export_metadata jsonb not null default '{}'::jsonb,
  notes text,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('scraping','billing','account','general')),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add constraint products_id_tenant_key unique (id, tenant_id);
alter table public.product_variants
  add constraint product_variants_id_tenant_key unique (id, tenant_id);
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
    foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete cascade,
  add constraint competitor_products_competitor_tenant_fkey
    foreign key (competitor_id, tenant_id) references public.competitors(id, tenant_id) on delete cascade;
alter table public.product_variants
  drop constraint product_variants_product_id_fkey,
  add constraint product_variants_product_tenant_fkey
    foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete cascade;

insert into public.product_variants (
  tenant_id, product_id, name, sku, our_price, currency, is_default
)
select tenant_id, id, 'Standard', our_sku, our_price, our_currency, true
from public.products
on conflict do nothing;

update public.competitor_products cp
set variant_id = pv.id
from public.product_variants pv
where cp.variant_id is null
  and pv.product_id = cp.product_id
  and pv.tenant_id = cp.tenant_id
  and pv.is_default = true;

alter table public.competitor_products
  alter column variant_id set not null,
  add constraint competitor_products_variant_tenant_fkey
    foreign key (variant_id, tenant_id)
    references public.product_variants(id, tenant_id) on delete cascade;
alter table public.price_snapshots
  drop constraint price_snapshots_competitor_product_id_fkey,
  add constraint price_snapshots_mapping_tenant_fkey
    foreign key (competitor_product_id, tenant_id)
    references public.competitor_products(id, tenant_id) on delete cascade;
alter table public.alerts
  drop constraint alerts_product_id_fkey,
  drop constraint alerts_competitor_id_fkey,
  add constraint alerts_product_tenant_fkey
    foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete cascade,
  add constraint alerts_competitor_tenant_fkey
    foreign key (competitor_id, tenant_id) references public.competitors(id, tenant_id) on delete cascade;
alter table public.alert_events
  drop constraint alert_events_alert_id_fkey,
  drop constraint alert_events_competitor_product_id_fkey,
  add constraint alert_events_alert_tenant_fkey
    foreign key (alert_id, tenant_id) references public.alerts(id, tenant_id) on delete cascade,
  add constraint alert_events_mapping_tenant_fkey
    foreign key (competitor_product_id, tenant_id)
    references public.competitor_products(id, tenant_id);
alter table public.scrape_failures
  drop constraint scrape_failures_product_id_fkey,
  drop constraint scrape_failures_competitor_product_id_fkey,
  add constraint scrape_failures_product_tenant_fkey
    foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete cascade,
  add constraint scrape_failures_mapping_tenant_fkey
    foreign key (competitor_product_id, tenant_id)
    references public.competitor_products(id, tenant_id) on delete cascade;

alter table public.tenants             enable row level security;
alter table public.competitors         enable row level security;
alter table public.products            enable row level security;
alter table public.product_variants    enable row level security;
alter table public.competitor_products enable row level security;
alter table public.match_suggestions   enable row level security;
alter table public.repricing_rules     enable row level security;
alter table public.reprice_suggestions enable row level security;
alter table public.product_insights    enable row level security;
alter table public.price_snapshots     enable row level security;
alter table public.alerts              enable row level security;
alter table public.alert_events        enable row level security;
alter table public.alert_digest_runs   enable row level security;
alter table public.scrape_failures     enable row level security;
alter table public.api_keys            enable row level security;
alter table public.alert_channels      enable row level security;
alter table public.team_members        enable row level security;
alter table public.billing_orders      enable row level security;
alter table public.billing_invoices    enable row level security;
alter table public.connector_sources   enable row level security;
alter table public.audit_events        enable row level security;
alter table public.scrape_jobs         enable row level security;
alter table public.report_schedules    enable row level security;
alter table public.report_runs         enable row level security;
alter table public.connector_sync_runs enable row level security;
alter table public.alert_channel_deliveries enable row level security;
alter table public.privacy_requests    enable row level security;
alter table public.support_tickets     enable row level security;

create or replace function public.my_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select tenant_id
  from (
    select id as tenant_id, 0 as priority
    from public.tenants
    where user_id = auth.uid()
    union all
    select tenant_id, 1 as priority
    from public.team_members
    where user_id = auth.uid()
      and accepted = true
  ) memberships
  order by priority
  limit 1;
$$;
revoke all on function public.my_tenant_id() from public;
grant execute on function public.my_tenant_id() to authenticated, service_role;

create or replace function public.can_manage_team(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.tenants
    where id = target_tenant_id
      and user_id = auth.uid()
  )
  or exists (
    select 1
    from public.team_members
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and accepted = true
  );
$$;
revoke all on function public.can_manage_team(uuid) from public;
grant execute on function public.can_manage_team(uuid) to authenticated, service_role;

create policy "tenants: visible membership" on public.tenants
  for select using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.team_members
      where tenant_id = public.tenants.id
        and user_id = auth.uid()
        and accepted = true
    )
  );
create policy "tenants: owner insert" on public.tenants
  for insert with check (user_id = auth.uid());
create policy "tenants: owner update" on public.tenants
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "tenants: owner delete" on public.tenants
  for delete using (user_id = auth.uid());

create policy "competitors: own tenant" on public.competitors
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "products: own tenant" on public.products
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "product_variants: own tenant" on public.product_variants
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "competitor_products: own tenant" on public.competitor_products
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "match_suggestions: own tenant" on public.match_suggestions
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());
create policy "repricing_rules: own tenant" on public.repricing_rules
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());
create policy "reprice_suggestions: own tenant" on public.reprice_suggestions
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());
create policy "product_insights: own tenant" on public.product_insights
  for select using (tenant_id = public.my_tenant_id());

create policy "price_snapshots: own tenant" on public.price_snapshots
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "alerts: own tenant" on public.alerts
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "alert_events: own tenant" on public.alert_events
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "alert_digest_runs: tenant read" on public.alert_digest_runs
  for select using (tenant_id = public.my_tenant_id());

create policy "alert_channel_deliveries: tenant read" on public.alert_channel_deliveries
  for select using (tenant_id = public.my_tenant_id());
create policy "alert_channel_deliveries: admin insert" on public.alert_channel_deliveries
  for insert with check (public.can_manage_team(tenant_id));

create policy "scrape_failures: own tenant" on public.scrape_failures
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "api_keys: admin select" on public.api_keys
  for select using (public.can_manage_team(tenant_id));
create policy "api_keys: admin insert" on public.api_keys
  for insert with check (public.can_manage_team(tenant_id));
create policy "api_keys: admin update" on public.api_keys
  for update using (public.can_manage_team(tenant_id))
  with check (public.can_manage_team(tenant_id));

create policy "alert_channels: admin select" on public.alert_channels
  for select using (public.can_manage_team(tenant_id));
create policy "alert_channels: admin insert" on public.alert_channels
  for insert with check (public.can_manage_team(tenant_id));
create policy "alert_channels: admin update" on public.alert_channels
  for update using (public.can_manage_team(tenant_id))
  with check (public.can_manage_team(tenant_id));
create policy "alert_channels: admin delete" on public.alert_channels
  for delete using (public.can_manage_team(tenant_id));

create policy "team_members: visible membership" on public.team_members
  for select using (
    tenant_id = public.my_tenant_id()
    or user_id = auth.uid()
  );
create policy "team_members: accept own invite" on public.team_members
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "team_members: admin insert" on public.team_members
  for insert with check (public.can_manage_team(tenant_id));
create policy "team_members: admin delete" on public.team_members
  for delete using (public.can_manage_team(tenant_id));

create policy "connector_sources: admin select" on public.connector_sources
  for select using (public.can_manage_team(tenant_id));
create policy "connector_sources: admin insert" on public.connector_sources
  for insert with check (public.can_manage_team(tenant_id));
create policy "connector_sources: admin update" on public.connector_sources
  for update using (public.can_manage_team(tenant_id))
  with check (public.can_manage_team(tenant_id));
create policy "connector_sources: admin delete" on public.connector_sources
  for delete using (public.can_manage_team(tenant_id));

create policy "audit_events: tenant read" on public.audit_events
  for select using (tenant_id = public.my_tenant_id());
create policy "scrape_jobs: tenant read" on public.scrape_jobs
  for select using (tenant_id = public.my_tenant_id());
create policy "report_schedules: tenant read" on public.report_schedules
  for select using (tenant_id = public.my_tenant_id());
create policy "report_schedules: admin write" on public.report_schedules
  for all using (public.can_manage_team(tenant_id))
  with check (public.can_manage_team(tenant_id));
create policy "report_runs: tenant read" on public.report_runs
  for select using (tenant_id = public.my_tenant_id());
create policy "connector_sync_runs: tenant read" on public.connector_sync_runs
  for select using (tenant_id = public.my_tenant_id());
create policy "privacy_requests: tenant read" on public.privacy_requests
  for select using (tenant_id = public.my_tenant_id());
create policy "privacy_requests: tenant insert" on public.privacy_requests
  for insert with check (tenant_id = public.my_tenant_id());
create policy "support_tickets: tenant read" on public.support_tickets
  for select using (tenant_id = public.my_tenant_id());
create policy "support_tickets: tenant insert" on public.support_tickets
  for insert with check (tenant_id = public.my_tenant_id() and user_id = auth.uid());

create or replace view public.v_latest_prices
with (security_invoker = true) as
select distinct on (cp.id)
  cp.id                   as competitor_product_id,
  cp.tenant_id,
  cp.product_id,
  cp.variant_id,
  cp.competitor_id,
  cp.competitor_url,
  cp.health_status,
  cp.consecutive_failures,
  cp.last_failure_at,
  cp.last_failure_reason,
  cp.last_successful_scrape_at,
  cp.broken_reason,
  p.name                  as product_name,
  pv.name                 as variant_name,
  pv.sku                  as variant_sku,
  pv.gtin                 as variant_gtin,
  pv.our_price,
  pv.currency             as our_currency,
  c.shop_name             as competitor_shop,
  ps.price                as competitor_price,
  ps.in_stock,
  ps.scraped_at,
  ps.scrape_ok,
  round(((ps.price - pv.our_price) / nullif(pv.our_price, 0)) * 100, 2) as delta_pct
from public.competitor_products cp
join public.products p    on p.id = cp.product_id and p.tenant_id = cp.tenant_id
join public.product_variants pv on pv.id = cp.variant_id and pv.tenant_id = cp.tenant_id
join public.competitors c on c.id = cp.competitor_id and c.tenant_id = cp.tenant_id
left join public.price_snapshots ps
  on ps.competitor_product_id = cp.id and ps.tenant_id = cp.tenant_id
where cp.active = true and p.active = true and pv.active = true and c.active = true
order by cp.id, ps.scraped_at desc;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.tenants, public.competitors,
  public.products, public.product_variants, public.competitor_products,
  public.match_suggestions, public.repricing_rules, public.reprice_suggestions,
  public.alerts to authenticated;
grant select on public.product_insights to authenticated;
grant select on public.price_snapshots, public.alert_events, public.v_latest_prices to authenticated;
grant select on public.alert_digest_runs to authenticated;
grant select on public.alert_channel_deliveries to authenticated;
grant select on public.scrape_failures to authenticated;
grant select (id, tenant_id, name, created_at, last_used, revoked)
  on public.api_keys to authenticated;
grant insert (id, tenant_id, key_prefix, key_hash, name)
  on public.api_keys to authenticated;
grant update (revoked)
  on public.api_keys to authenticated;
grant select, insert, update, delete on public.alert_channels,
  public.connector_sources to authenticated;
grant select on public.audit_events, public.scrape_jobs, public.report_schedules,
  public.report_runs, public.connector_sync_runs, public.privacy_requests,
  public.support_tickets to authenticated;
grant insert on public.report_schedules, public.report_runs, public.connector_sync_runs,
  public.privacy_requests, public.alert_channel_deliveries to authenticated;
grant insert on public.support_tickets to authenticated;
grant update on public.report_schedules to authenticated;
grant select on public.team_members to authenticated;
create policy "billing_orders: tenant owner read" on public.billing_orders
  for select using (
    tenant_id = public.my_tenant_id()
    and exists (
      select 1 from public.tenants
      where tenants.id = billing_orders.tenant_id
        and tenants.user_id = auth.uid()
    )
  );
create policy "billing_invoices: tenant owner read" on public.billing_invoices
  for select using (
    tenant_id = public.my_tenant_id()
    and exists (
      select 1 from public.tenants
      where tenants.id = billing_invoices.tenant_id
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
grant select on public.billing_invoices to authenticated;
grant insert (tenant_id, order_code, plan, amount_cents)
  on public.billing_orders to authenticated;
grant update (accepted) on public.team_members to authenticated;
grant insert (tenant_id, user_id, role, accepted) on public.team_members to authenticated;
grant delete on public.team_members to authenticated;
grant all on public.tenants, public.competitors, public.products,
  public.product_variants, public.competitor_products, public.match_suggestions,
  public.repricing_rules, public.reprice_suggestions,
  public.product_insights,
  public.price_snapshots, public.alerts,
  public.alert_events, public.alert_digest_runs, public.scrape_failures, public.api_keys,
  public.alert_channels, public.team_members, public.connector_sources,
  public.audit_events, public.scrape_jobs, public.report_schedules,
  public.report_runs, public.connector_sync_runs, public.alert_channel_deliveries,
  public.privacy_requests to service_role;
grant all on public.support_tickets to service_role;
grant all on public.billing_orders to service_role;
grant all on public.billing_invoices to service_role;

notify pgrst, 'reload schema';
