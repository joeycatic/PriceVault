-- PriceVault RLS policy reference. This section mirrors backend/db/schema.sql.

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
alter table public.connector_sources   enable row level security;

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
