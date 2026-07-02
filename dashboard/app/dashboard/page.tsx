import Link from 'next/link'

import { runManualScrape } from '@/app/dashboard/scrape-actions'
import { ManualScrapeButton } from '@/components/ui/ManualScrapeButton'
import { PriceTable } from '@/components/ui/PriceTable'
import { currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import type { LatestPrice } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const tenant = await currentTenant()

  let rows: LatestPrice[] = []
  let priceSourceCount = 0
  let loadError = false
  if (tenant) {
    const [priceResult, sourceResult] = await Promise.all([
      supabase
        .from('v_latest_prices')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('delta_pct', { ascending: false }),
      supabase
        .from('competitor_products')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('active', true),
    ])
    rows = (priceResult.data ?? []) as LatestPrice[]
    priceSourceCount = sourceResult.data?.length ?? 0
    loadError = Boolean(priceResult.error)
  }

  const activePrices = rows.filter((row) => row.competitor_price !== null).length
  const undercut = rows.filter((row) => Number(row.delta_pct ?? 0) < 0).length
  const unavailable = rows.filter((row) => row.in_stock === false).length
  const lastScrapedAt = rows
    .map((row) => row.scraped_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null

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
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-2 text-xs text-vault-500">
            <span className="h-2 w-2 rounded-full bg-vault-lime shadow-[0_0_8px_rgba(180,240,0,.6)]" />
            Automatisch alle 12 Stunden
          </div>
          <ManualScrapeButton action={runManualScrape} disabled={!priceSourceCount} compact />
        </div>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Preisstatus">
        {[
          ['Preise erfasst', activePrices],
          ['Handlungsbedarf', undercut],
          ['Nicht verfügbar', unavailable],
          ['Letzter Abruf', lastScrapedAt ? formatRelativeTime(lastScrapedAt) : 'Noch nie'],
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
        <div className="space-y-6">
          {!rows.length && (
            <section className="panel border-l-2 border-l-vault-lime p-6" aria-labelledby="empty-prices">
              <h2 id="empty-prices" className="text-lg font-semibold">Noch keine gescrapten Preise</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
                Lege unter Produkte eine Preisquelle an. Danach werden die Preise automatisch alle 12 Stunden gescraped oder sofort manuell abgerufen.
              </p>
              <Link href="/dashboard/products" className="button-primary mt-5">Produkte & Preisquellen öffnen →</Link>
            </section>
          )}
          <PriceTable rows={rows} />
        </div>
      )}
    </>
  )
}
