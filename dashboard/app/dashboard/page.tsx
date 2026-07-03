import Link from 'next/link'

import { runManualScrape } from '@/app/dashboard/scrape-actions'
import { ManualScrapeButton } from '@/components/ui/ManualScrapeButton'
import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { PriceTable } from '@/components/ui/PriceTable'
import { currentTenant } from '@/lib/backend'
import { minimumScrapeFrequency } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import type { LatestPrice } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const tenant = await currentTenant()

  let rows: LatestPrice[] = []
  let priceSourceCount = 0
  let unhealthySourceCount = 0
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
        .select('id, health_status')
        .eq('tenant_id', tenant.id)
        .eq('active', true),
    ])
    rows = (priceResult.data ?? []) as LatestPrice[]
    priceSourceCount = sourceResult.data?.length ?? 0
    unhealthySourceCount = sourceResult.data?.filter((source) => source.health_status !== 'healthy').length ?? 0
    loadError = Boolean(priceResult.error)
  }

  const activePrices = rows.filter((row) => row.competitor_price !== null).length
  const undercut = rows.filter((row) => Number(row.delta_pct ?? 0) < 0).length
  const unavailable = rows.filter((row) => row.in_stock === false).length
  const trackedProducts = new Set(rows.map((row) => row.product_id)).size
  const priceLeaders = new Set(rows.filter((row) => Number(row.delta_pct ?? 0) > 0).map((row) => row.product_id)).size
  const sourceUptime = priceSourceCount
    ? ((priceSourceCount - unhealthySourceCount) / priceSourceCount) * 100
    : 0
  const lastScrapedAt = rows
    .map((row) => row.scraped_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
  const planFrequency = minimumScrapeFrequency(tenant?.plan)

  return (
    <>
      <PageHeader
        eyebrow="Marktmonitor"
        title="Preisübersicht"
        description={<>Aktuelle Abweichungen für {tenant?.shop_name ?? 'deinen Shop'}.</>}
        actions={<div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-2 text-xs text-vault-500">
            <span className="h-2 w-2 rounded-full bg-merchant-success" />
            Tarifintervall ab {planFrequency} Std.
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="button-secondary" href="/api/export/csv">CSV</a>
            <a className="button-secondary" href="/api/export/pdf">PDF</a>
            <ManualScrapeButton action={runManualScrape} disabled={!priceSourceCount} compact />
          </div>
        </div>}
      />

      <div className="mb-6">
        <MetricGrid items={[
          { label: 'Verfolgte Produkte', value: trackedProducts, detail: `${priceSourceCount} aktive Quellen`, tone: 'success' },
          { label: 'Handlungsbedarf', value: undercut + unavailable + unhealthySourceCount, detail: 'Preis, Bestand oder Quelle', tone: undercut + unavailable + unhealthySourceCount ? 'warning' : 'success' },
          { label: 'Preisführer', value: priceLeaders, detail: 'Eigener Preis ist niedriger', tone: 'success' },
          { label: 'Quellenverfügbarkeit', value: `${sourceUptime.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`, detail: `${activePrices} Preise erfasst`, tone: unhealthySourceCount ? 'danger' : 'success' },
          { label: 'Letzter Abruf', value: lastScrapedAt ? formatRelativeTime(lastScrapedAt) : 'Noch nie', detail: 'Automatischer Preisabruf', tone: 'neutral' },
        ]} />
      </div>

      {!tenant ? (
        <div className="panel border-l-4 border-l-amber-400 p-6 text-sm text-amber-900">
          Für dieses Konto wurde noch kein Mandant eingerichtet. Lege den Datensatz in Supabase an.
        </div>
      ) : loadError ? (
        <div className="panel border-l-4 border-l-red-500 p-6 text-sm text-red-800">
          Die Preisdaten konnten nicht geladen werden.
        </div>
      ) : (
        <div className="space-y-6">
          {unhealthySourceCount > 0 && (
            <section className="panel border-l-4 border-l-amber-400 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">Preisquellen prüfen</h2>
                  <p className="mt-1 text-sm text-vault-300">
                    {unhealthySourceCount} Quelle(n) liefern wiederholt keine verwertbaren Preise.
                  </p>
                </div>
                <Link href="/dashboard/products" className="button-secondary">Quellen reparieren</Link>
              </div>
            </section>
          )}
          {!rows.length && (
            <section className="panel p-6" aria-labelledby="empty-prices">
              <h2 id="empty-prices" className="text-lg font-semibold">Noch keine gescrapten Preise</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
                Lege unter Produkte eine Preisquelle an. Danach werden die Preise nach dem gewählten Intervall automatisch oder sofort manuell abgerufen.
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
