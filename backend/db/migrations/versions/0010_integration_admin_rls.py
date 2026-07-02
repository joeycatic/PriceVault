"""Restrict integration management tables to tenant admins.

Revision ID: 0010_integration_admin_rls
Revises: 0009_team_member_admin
Create Date: 2026-07-01
"""

from alembic import op


revision = "0010_integration_admin_rls"
down_revision = "0009_team_member_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        drop policy if exists "api_keys: own tenant" on public.api_keys;
        drop policy if exists "alert_channels: own tenant" on public.alert_channels;
        drop policy if exists "connector_sources: own tenant" on public.connector_sources;

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

        create policy "connector_sources: admin select" on public.connector_sources
          for select using (public.can_manage_team(tenant_id));
        create policy "connector_sources: admin insert" on public.connector_sources
          for insert with check (public.can_manage_team(tenant_id));
        create policy "connector_sources: admin update" on public.connector_sources
          for update using (public.can_manage_team(tenant_id))
          with check (public.can_manage_team(tenant_id));
        create policy "connector_sources: admin delete" on public.connector_sources
          for delete using (public.can_manage_team(tenant_id));

        notify pgrst, 'reload schema';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        drop policy if exists "api_keys: admin select" on public.api_keys;
        drop policy if exists "api_keys: admin insert" on public.api_keys;
        drop policy if exists "api_keys: admin update" on public.api_keys;

        drop policy if exists "alert_channels: admin select" on public.alert_channels;
        drop policy if exists "alert_channels: admin insert" on public.alert_channels;
        drop policy if exists "alert_channels: admin update" on public.alert_channels;
        drop policy if exists "alert_channels: admin delete" on public.alert_channels;

        drop policy if exists "connector_sources: admin select" on public.connector_sources;
        drop policy if exists "connector_sources: admin insert" on public.connector_sources;
        drop policy if exists "connector_sources: admin update" on public.connector_sources;
        drop policy if exists "connector_sources: admin delete" on public.connector_sources;

        create policy "api_keys: own tenant" on public.api_keys
          for all using (tenant_id = public.my_tenant_id())
          with check (tenant_id = public.my_tenant_id());
        create policy "alert_channels: own tenant" on public.alert_channels
          for all using (tenant_id = public.my_tenant_id())
          with check (tenant_id = public.my_tenant_id());
        create policy "connector_sources: own tenant" on public.connector_sources
          for all using (tenant_id = public.my_tenant_id())
          with check (tenant_id = public.my_tenant_id());

        notify pgrst, 'reload schema';
        """
    )
