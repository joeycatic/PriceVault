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
  plan        text not null default 'trial',
  created_at  timestamptz not null default now(),
  unique(user_id)
);

create table public.competitors (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  shop_name       text not null,
  base_url        text not null,
  selector_price  text,
  selector_stock  text,
  scrape_freq_h   int not null default 12,
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
  our_price       numeric(10,2),
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
  condition             text not null,
  threshold             numeric(10,2) not null,
  notify_email          text not null,
  active                boolean not null default true,
  last_triggered_at     timestamptz,
  cooldown_h            int not null default 24,
  created_at            timestamptz not null default now()
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
  triggered_at          timestamptz not null default now()
);

alter table public.tenants             enable row level security;
alter table public.competitors         enable row level security;
alter table public.products            enable row level security;
alter table public.competitor_products enable row level security;
alter table public.price_snapshots     enable row level security;
alter table public.alerts              enable row level security;
alter table public.alert_events        enable row level security;

create or replace function public.my_tenant_id()
returns uuid language sql stable as $$
  select id from public.tenants where user_id = auth.uid() limit 1;
$$;

create policy "tenant: own row" on public.tenants
  for all using (user_id = auth.uid());

create policy "competitors: own tenant" on public.competitors
  for all using (tenant_id = public.my_tenant_id());

create policy "products: own tenant" on public.products
  for all using (tenant_id = public.my_tenant_id());

create policy "competitor_products: own tenant" on public.competitor_products
  for all using (tenant_id = public.my_tenant_id());

create policy "price_snapshots: own tenant" on public.price_snapshots
  for all using (tenant_id = public.my_tenant_id());

create policy "alerts: own tenant" on public.alerts
  for all using (tenant_id = public.my_tenant_id());

create policy "alert_events: own tenant" on public.alert_events
  for all using (tenant_id = public.my_tenant_id());

create or replace view public.v_latest_prices as
select distinct on (cp.id)
  cp.id                   as competitor_product_id,
  cp.tenant_id,
  cp.product_id,
  cp.competitor_id,
  cp.competitor_url,
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
join public.products p    on p.id = cp.product_id
join public.competitors c on c.id = cp.competitor_id
left join public.price_snapshots ps on ps.competitor_product_id = cp.id
order by cp.id, ps.scraped_at desc;

