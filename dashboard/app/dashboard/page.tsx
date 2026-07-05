import Link from 'next/link'
import {
  ArrowRight,
  BadgeEuro,
  BellRing,
  Gauge,
  HeartPulse,
  PackageSearch,
  Plug,
} from 'lucide-react'

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
  let recentAlertCount = 0
  let pendingMatchCount = 0
  let pendingRepriceCount = 0
  let loadError = false
  if (tenant) {
    const [priceResult, sourceResult, alertResult, matchResult, repriceResult] = await Promise.all([
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
      supabase
        .from('alert_events')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id),
      supabase
        .from('match_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('status', 'pending'),
      supabase
        .from('reprice_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('status', 'pending'),
    ])
    rows = (priceResult.data ?? []) as LatestPrice[]
    priceSourceCount = sourceResult.data?.length ?? 0
    unhealthySourceCount = sourceResult.data?.filter((source) => source.health_status !== 'healthy').length ?? 0
    recentAlertCount = alertResult.count ?? 0
    pendingMatchCount = matchResult.count ?? 0
    pendingRepriceCount = repriceResult.count ?? 0
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

      <section className="mb-6" aria-labelledby="workspaces">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Funktionsbereiche</p>
            <h2 id="workspaces" className="mt-1 text-lg font-semibold">Deine PriceVault-Arbeitsbereiche</h2>
          </div>
          <Link href="/dashboard/settings" className="hidden text-sm font-semibold text-vault-300 hover:text-vault-100 sm:inline-flex">
            Alle Einstellungen
          </Link>
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border border-vault-700 bg-vault-700 shadow-panel sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              href: '/dashboard/products#matching-workspace',
              icon: PackageSearch,
              title: 'Katalog & Matching',
              copy: 'Varianten, CSV-Import, manuelle Zuordnung und Automatch-Vorschläge.',
              status: pendingMatchCount ? `${pendingMatchCount} Vorschläge offen` : 'Keine offenen Vorschläge',
              tone: pendingMatchCount ? 'text-amber-700' : 'text-merchant-success',
            },
            {
              href: '/dashboard/source-health',
              icon: HeartPulse,
              title: 'Quellenzustand',
              copy: 'Erreichbarkeit, Fehlerfolgen, Bestand und letzte erfolgreiche Abrufe.',
              status: unhealthySourceCount ? `${unhealthySourceCount} Quellen prüfen` : 'Alle Quellen gesund',
              tone: unhealthySourceCount ? 'text-red-700' : 'text-merchant-success',
            },
            {
              href: '/dashboard/alerts',
              icon: BellRing,
              title: 'Alarme & Tagesübersicht',
              copy: 'Schwellenwerte, Bestandsereignisse, Kanäle und deutscher E-Mail-Digest.',
              status: recentAlertCount ? `${recentAlertCount} Ereignisse erfasst` : 'Noch keine Ereignisse',
              tone: recentAlertCount ? 'text-amber-700' : 'text-merchant-success',
            },
            {
              href: '/dashboard/repricing',
              icon: BadgeEuro,
              title: 'Preisvorschläge',
              copy: 'Marktpreis abgleichen, prozentual unterbieten und Margen schützen.',
              status: pendingRepriceCount ? `${pendingRepriceCount} Freigaben offen` : 'Keine Freigaben offen',
              tone: pendingRepriceCount ? 'text-amber-700' : 'text-vault-500',
            },
            {
              href: '/dashboard/settings/integrations',
              icon: Plug,
              title: 'Shop-Integrationen',
              copy: 'Shopify, WooCommerce, CSV und Merchant-Feeds synchronisieren.',
              status: 'Connectoren verwalten',
              tone: 'text-vault-500',
            },
            {
              href: trackedProducts ? `/dashboard/products/${rows[0]?.product_id}` : '/dashboard/products',
              icon: Gauge,
              title: 'Analyse & Preisbereich',
              copy: 'Preisverlauf, Vergleich, empfohlener Korridor und KI-Kommentar je Produkt.',
              status: trackedProducts ? `${trackedProducts} Produktanalysen` : 'Erstes Produkt anlegen',
              tone: trackedProducts ? 'text-merchant-success' : 'text-vault-500',
            },
          ].map(({ href, icon: Icon, title, copy, status, tone }) => (
            <Link
              key={href}
              href={href}
              className="group min-h-44 bg-white p-5 transition hover:bg-vault-800"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-vault-700 bg-vault-800 text-vault-300">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <ArrowRight className="h-4 w-4 text-vault-500 transition group-hover:translate-x-1 group-hover:text-vault-100" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-vault-500">{copy}</p>
              <p className={`mt-3 text-xs font-semibold ${tone}`}>{status}</p>
            </Link>
          ))}
        </div>
      </section>

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
