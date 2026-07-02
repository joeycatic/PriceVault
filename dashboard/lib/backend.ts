import { createClient } from '@/lib/supabase/server'
import type { Tenant } from '@/lib/types'

export async function currentTenant() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('tenants').select('*').limit(1).maybeSingle()
  if (!data) return null
  if (data.user_id === user.id) return { ...data, membership_role: 'owner' } as Tenant

  const { data: membership } = await supabase
    .from('team_members')
    .select('role,accepted')
    .eq('tenant_id', data.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return null
  if (!membership.accepted) {
    await supabase
      .from('team_members')
      .update({ accepted: true })
      .eq('tenant_id', data.id)
      .eq('user_id', user.id)
  }
  return { ...data, membership_role: membership.role } as Tenant
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
