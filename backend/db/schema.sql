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

create table public.competitor_products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
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
  unique(product_id, competitor_id)
);

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
  condition             text not null check (condition in ('below_pct', 'above_pct', 'below_abs', 'above_abs', 'out_of_stock', 'back_in_stock', 'undercut_abs')),
  threshold             numeric(10,2),
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
  delta_pct             numeric(6,2),
  email_sent            boolean not null default false,
  trigger_reason        text,
  triggered_at          timestamptz not null default now()
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
    foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete cascade,
  add constraint competitor_products_competitor_tenant_fkey
    foreign key (competitor_id, tenant_id) references public.competitors(id, tenant_id) on delete cascade;
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
alter table public.competitor_products enable row level security;
alter table public.price_snapshots     enable row level security;
alter table public.alerts              enable row level security;
alter table public.alert_events        enable row level security;
alter table public.scrape_failures     enable row level security;
alter table public.api_keys            enable row level security;
alter table public.alert_channels      enable row level security;
alter table public.team_members        enable row level security;
alter table public.billing_orders      enable row level security;
alter table public.connector_sources   enable row level security;
alter table public.audit_events        enable row level security;
alter table public.scrape_jobs         enable row level security;
alter table public.report_schedules    enable row level security;
alter table public.report_runs         enable row level security;
alter table public.connector_sync_runs enable row level security;
alter table public.alert_channel_deliveries enable row level security;
alter table public.privacy_requests    enable row level security;

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

create policy "competitor_products: own tenant" on public.competitor_products
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "price_snapshots: own tenant" on public.price_snapshots
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "alerts: own tenant" on public.alerts
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

create policy "alert_events: own tenant" on public.alert_events
  for all using (tenant_id = public.my_tenant_id())
  with check (tenant_id = public.my_tenant_id());

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

create or replace view public.v_latest_prices
with (security_invoker = true) as
select distinct on (cp.id)
  cp.id                   as competitor_product_id,
  cp.tenant_id,
  cp.product_id,
  cp.competitor_id,
  cp.competitor_url,
  cp.health_status,
  cp.consecutive_failures,
  cp.last_failure_at,
  cp.last_failure_reason,
  cp.last_successful_scrape_at,
  cp.broken_reason,
  p.name                  as product_name,
  p.our_price,
  p.our_currency,
  c.shop_name             as competitor_shop,
  ps.price                as competitor_price,
  ps.in_stock,
  ps.scraped_at,
  ps.scrape_ok,
  round(((ps.price - p.our_price) / nullif(p.our_price, 0)) * 100, 2) as delta_pct
from public.competitor_products cp
join public.products p    on p.id = cp.product_id and p.tenant_id = cp.tenant_id
join public.competitors c on c.id = cp.competitor_id and c.tenant_id = cp.tenant_id
left join public.price_snapshots ps
  on ps.competitor_product_id = cp.id and ps.tenant_id = cp.tenant_id
where cp.active = true and p.active = true and c.active = true
order by cp.id, ps.scraped_at desc;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.tenants, public.competitors,
  public.products, public.competitor_products, public.alerts to authenticated;
grant select on public.price_snapshots, public.alert_events, public.v_latest_prices to authenticated;
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
  public.report_runs, public.connector_sync_runs, public.privacy_requests to authenticated;
grant insert on public.report_schedules, public.report_runs, public.connector_sync_runs,
  public.privacy_requests, public.alert_channel_deliveries to authenticated;
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
grant update (accepted) on public.team_members to authenticated;
grant insert (tenant_id, user_id, role, accepted) on public.team_members to authenticated;
grant delete on public.team_members to authenticated;
grant all on public.tenants, public.competitors, public.products,
  public.competitor_products, public.price_snapshots, public.alerts,
  public.alert_events, public.scrape_failures, public.api_keys,
  public.alert_channels, public.team_members, public.connector_sources,
  public.audit_events, public.scrape_jobs, public.report_schedules,
  public.report_runs, public.connector_sync_runs, public.alert_channel_deliveries,
  public.privacy_requests to service_role;
grant all on public.billing_orders to service_role;

notify pgrst, 'reload schema';
