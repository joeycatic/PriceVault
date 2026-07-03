-- PriceVault RLS policy reference. This section mirrors backend/db/schema.sql.

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
