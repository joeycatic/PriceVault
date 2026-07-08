import { createClient } from '@/lib/supabase/server'
import type { Tenant } from '@/lib/types'
import { cookies } from 'next/headers'

export async function listTenantsForUser(): Promise<Tenant[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data: tenants } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: true })
  if (!tenants?.length) return []

  const result: Tenant[] = []
  for (const tenant of tenants) {
    if (tenant.user_id === user.id) {
      result.push({ ...tenant, membership_role: 'owner' } as Tenant)
      continue
    }
    const { data: membership } = await supabase
      .from('team_members')
      .select('role,accepted')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (membership?.accepted) result.push({ ...tenant, membership_role: membership.role } as Tenant)
  }
  return result
}

export async function currentTenant() {
  const tenants = await listTenantsForUser()
  const selectedTenantId = (await cookies()).get('pv-tenant')?.value
  if (selectedTenantId) {
    const selected = tenants.find((tenant) => tenant.id === selectedTenantId)
    if (selected) return selected
  }
  if (tenants.length) return tenants[0]

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: rawTenants } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: true })
  if (!rawTenants?.length) return null

  for (const tenant of rawTenants) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('role,accepted')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership) continue
    if (!membership.accepted) {
      await supabase
        .from('team_members')
        .update({ accepted: true })
        .eq('tenant_id', tenant.id)
        .eq('user_id', user.id)
    }
    return { ...tenant, membership_role: membership.role } as Tenant
  }
  return null
}

export function backendBaseUrl() {
  return process.env.BACKEND_URL?.replace(/\/$/, '') ?? null
}

export async function backendFetch(path: string, tenantId: string, init: RequestInit = {}) {
  const base = backendBaseUrl()
  if (!base) throw new Error('BACKEND_URL ist nicht konfiguriert.')
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Supabase-Sitzung ist abgelaufen.')
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      'X-Tenant-ID': tenantId,
      ...(init.headers ?? {}),
    },
  })
}
