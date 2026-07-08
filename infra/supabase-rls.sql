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
alter table public.subscriptions       enable row level security;
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
alter table public.source_policies     enable row level security;
alter table public.repricing_changes   enable row level security;
alter table public.usage_events        enable row level security;
alter table public.internal_cost_rates enable row level security;
alter table public.tenant_cost_summaries enable row level security;
alter table public.product_events      enable row level security;
alter table public.privacy_deletion_receipts enable row level security;
alter table public.billing_adjustments enable row level security;
alter table public.billing_reconciliations enable row level security;
alter table public.security_incidents enable row level security;
alter table public.recovery_drills enable row level security;
alter table public.billing_refund_requests enable row level security;
alter table public.public_incidents enable row level security;
alter table public.csp_violation_reports enable row level security;
alter table public.capacity_evaluations enable row level security;
alter table public.backup_verifications enable row level security;
alter table public.billing_reconciliation_exceptions enable row level security;
alter table public.source_repair_assignments enable row level security;

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
create policy "privacy_requests: tenant cancel" on public.privacy_requests
  for update using (tenant_id = public.my_tenant_id() and status in ('cooling_off','scheduled'))
  with check (tenant_id = public.my_tenant_id() and status = 'canceled');
create policy "support_tickets: tenant read" on public.support_tickets
  for select using (tenant_id = public.my_tenant_id());
create policy "support_tickets: tenant insert" on public.support_tickets
  for insert with check (tenant_id = public.my_tenant_id() and user_id = auth.uid());
create policy "source_policies: tenant read" on public.source_policies
  for select using (tenant_id = public.my_tenant_id());
create policy "source_policies: admin write" on public.source_policies
  for all using (public.can_manage_team(tenant_id))
  with check (public.can_manage_team(tenant_id));
create policy "repricing_changes: tenant read" on public.repricing_changes
  for select using (tenant_id = public.my_tenant_id());
create policy "usage_events: tenant read" on public.usage_events
  for select using (tenant_id = public.my_tenant_id());
create policy "tenant_cost_summaries: tenant read" on public.tenant_cost_summaries
  for select using (tenant_id = public.my_tenant_id());

create or replace view public.v_latest_prices
with (security_invoker = true) as
select distinct on (cp.id)
  cp.id                   as competitor_product_id,
  cp.tenant_id,
  cp.product_id,
  cp.variant_id,
  cp.competitor_id,
  cp.competitor_url,
  cp.expected_currency,
  cp.expected_variant,
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
  c.scrape_freq_h,
  ps.id                   as snapshot_id,
  ps.price                as competitor_price,
  ps.currency             as competitor_currency,
  ps.price_type,
  ps.extraction_method,
  ps.confidence,
  ps.validation_state,
  ps.validation_reason,
  ps.in_stock,
  ps.scraped_at,
  ps.scrape_ok,
  round(((ps.price - pv.our_price) / nullif(pv.our_price, 0)) * 100, 2) as delta_pct
from public.competitor_products cp
join public.products p    on p.id = cp.product_id and p.tenant_id = cp.tenant_id
join public.product_variants pv on pv.id = cp.variant_id and pv.tenant_id = cp.tenant_id
join public.competitors c on c.id = cp.competitor_id and c.tenant_id = cp.tenant_id
left join public.price_snapshots ps
  on ps.competitor_product_id = cp.id
  and ps.tenant_id = cp.tenant_id
  and ps.scrape_ok = true
  and ps.validation_state = 'valid'
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
  public.support_tickets, public.source_policies, public.repricing_changes,
  public.usage_events to authenticated;
grant insert on public.report_schedules, public.report_runs, public.connector_sync_runs,
  public.privacy_requests, public.alert_channel_deliveries to authenticated;
grant insert on public.support_tickets to authenticated;
grant update on public.report_schedules to authenticated;
grant update (status, canceled_at) on public.privacy_requests to authenticated;
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
create policy "subscriptions: tenant owner read" on public.subscriptions
  for select using (
    tenant_id = public.my_tenant_id()
    and exists (
      select 1 from public.tenants
      where tenants.id = subscriptions.tenant_id
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
create policy "billing_adjustments: tenant owner read" on public.billing_adjustments
  for select using (
    tenant_reference = public.my_tenant_id()
    and exists (
      select 1 from public.tenants
      where tenants.id = billing_adjustments.tenant_reference
        and tenants.user_id = auth.uid()
    )
  );
create policy "billing_refund_requests: tenant owner read" on public.billing_refund_requests
  for select using (
    tenant_id = public.my_tenant_id()
    and exists (select 1 from public.tenants where tenants.id = billing_refund_requests.tenant_id and tenants.user_id = auth.uid())
  );
create policy "billing_refund_requests: tenant owner insert" on public.billing_refund_requests
  for insert with check (
    tenant_id = public.my_tenant_id()
    and requested_by = auth.uid()
    and exists (select 1 from public.tenants where tenants.id = billing_refund_requests.tenant_id and tenants.user_id = auth.uid())
  );
create policy "public_incidents: public read" on public.public_incidents for select using (true);
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
grant select on public.subscriptions to authenticated;
grant select on public.billing_invoices to authenticated;
grant select on public.billing_adjustments to authenticated;
grant select, insert (tenant_id, tenant_reference, invoice_id, requested_by, amount_cents, reason, idempotency_key)
  on public.billing_refund_requests to authenticated;
grant select on public.public_incidents to anon, authenticated;
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
  public.privacy_requests, public.source_policies, public.repricing_changes,
  public.usage_events, public.product_events, public.billing_adjustments,
  public.billing_reconciliations, public.privacy_deletion_receipts,
  public.internal_cost_rates, public.tenant_cost_summaries,
  public.security_incidents, public.recovery_drills to service_role;
grant all on public.billing_refund_requests, public.public_incidents,
  public.csp_violation_reports, public.capacity_evaluations,
  public.backup_verifications, public.billing_reconciliation_exceptions to service_role;
grant all on public.source_repair_assignments to service_role;
grant all on public.support_tickets to service_role;
grant all on public.billing_orders to service_role;
grant all on public.subscriptions to service_role;
grant all on public.billing_invoices to service_role;

notify pgrst, 'reload schema';
