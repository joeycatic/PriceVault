import { UsageBar } from './UsageBar'
import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'

const PLAN_LIMITS = { free: 50, trial: 50, starter: 500, pro: 500, agency: 5000 }

export default async function UsagePage() {
  const supabase = await createClient()
  const tenant = await currentTenant()

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const { count } = tenant
    ? await supabase
        .from('price_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('scraped_at', today.toISOString())
    : { count: 0 }
  const plan = ((tenant?.plan as keyof typeof PLAN_LIMITS | null) ?? 'free')
  const limit = PLAN_LIMITS[plan]
  const used = count ?? 0

  return (
    <>
      <PageHeader eyebrow="Kontingent" title="Nutzung" description="Tageslimit, aktueller Verbrauch und Reset-Zeitpunkt für deine Preisabrufe." />
      <div className="mb-6"><MetricGrid items={[
          { label: 'Plan', value: plan },
          { label: 'Heute genutzt', value: used },
          { label: 'Tageslimit', value: limit },
          { label: 'Reset', value: '00:00 UTC' },
        ]} /></div>
      <section className="panel p-6">
        <UsageBar used={used} limit={limit} />
      </section>
    </>
  )
}
