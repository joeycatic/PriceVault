import { UsageBar } from './UsageBar'
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
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Kontingent</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Nutzung</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
          Tageslimit, aktueller Verbrauch und Reset-Zeitpunkt für deine Preisabrufe.
        </p>
      </header>
      <section className="panel p-6">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="eyebrow">Plan</p>
            <p className="mt-2 text-2xl font-bold uppercase">{plan}</p>
          </div>
          <div>
            <p className="eyebrow">Heute genutzt</p>
            <p className="mt-2 text-2xl font-bold">{used}</p>
          </div>
          <div>
            <p className="eyebrow">Reset</p>
            <p className="mt-2 text-2xl font-bold">00:00 UTC</p>
          </div>
        </div>
        <UsageBar used={used} limit={limit} />
      </section>
    </>
  )
}
