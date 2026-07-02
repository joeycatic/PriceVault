import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

const PLAN_LIMITS = { free: 50, trial: 50, starter: 500, pro: 500, agency: 5000 }

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id,plan')
    .limit(1)
    .maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'Kein Mandant eingerichtet' }, { status: 404 })

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('price_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .gte('scraped_at', today.toISOString())

  const plan = (tenant.plan ?? 'free') as keyof typeof PLAN_LIMITS
  return NextResponse.json({
    used: count ?? 0,
    limit: PLAN_LIMITS[plan],
    plan,
    next_reset: today.getTime() + 86_400_000,
  })
}
