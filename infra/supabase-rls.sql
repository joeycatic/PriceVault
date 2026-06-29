-- PriceVault RLS policy reference. This section mirrors backend/db/schema.sql.

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
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
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
