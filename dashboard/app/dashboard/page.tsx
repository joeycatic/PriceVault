import { PriceTable } from '@/components/ui/PriceTable'
import { createClient } from '@/lib/supabase/server'
import type { LatestPrice, Tenant } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: tenantData } = await supabase
    .from('tenants')
    .select('*')
    .eq('user_id', user!.id)
    .maybeSingle()
  const tenant = tenantData as Tenant | null

  let rows: LatestPrice[] = []
  let loadError = false
  if (tenant) {
    const result = await supabase
      .from('v_latest_prices')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('delta_pct', { ascending: false })
    rows = (result.data ?? []) as LatestPrice[]
    loadError = Boolean(result.error)
  }

  const activePrices = rows.filter((row) => row.competitor_price !== null).length
  const undercut = rows.filter((row) => Number(row.delta_pct ?? 0) > 0).length
  const unavailable = rows.filter((row) => row.in_stock === false).length

  return (
    <>
      <header className="mb-8 flex flex-col justify-between gap-5 border-b border-vault-700 pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Marktmonitor / Live-Stand</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Preisübersicht</h1>
          <p className="mt-2 text-sm text-vault-300">
            Aktuelle Abweichungen für {tenant?.shop_name ?? 'deinen Shop'}.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-vault-500">
          <span className="h-2 w-2 rounded-full bg-vault-lime shadow-[0_0_8px_rgba(180,240,0,.6)]" />
          Automatische Prüfung alle 12 Stunden
        </div>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Preisstatus">
        {[
          ['Preise erfasst', activePrices],
          ['Handlungsbedarf', undercut],
          ['Nicht verfügbar', unavailable],
        ].map(([label, value]) => (
          <div key={label} className="border border-vault-700 bg-vault-900/70 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-vault-500">{label}</p>
            <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      {!tenant ? (
        <div className="panel border-l-2 border-l-amber-300 p-6 text-sm text-amber-100">
          Für dieses Konto wurde noch kein Mandant eingerichtet. Lege den Datensatz in Supabase an.
        </div>
      ) : loadError ? (
        <div className="panel border-l-2 border-l-red-400 p-6 text-sm text-red-200">
          Die Preisdaten konnten nicht geladen werden.
        </div>
      ) : (
        <PriceTable rows={rows} />
      )}
    </>
  )
}
