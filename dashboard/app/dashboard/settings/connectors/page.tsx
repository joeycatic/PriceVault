import { revalidatePath } from 'next/cache'
import { AlertTriangle, Cable, CheckCircle2, FileSpreadsheet, RefreshCw, ShoppingBag, Store, Workflow } from 'lucide-react'

import {
  HeroStat,
  IntegrationBadge,
  IntegrationHero,
  IntegrationIcon,
  IntegrationSectionHeading,
  type IntegrationTone,
} from '@/components/integrations/IntegrationUI'
import { MutationButton } from '@/components/ui/MutationButton'
import { backendFetch, currentTenant } from '@/lib/backend'
import { hasPlan } from '@/lib/plan-gates'

type ConnectorSourceRow = {
  id: string
  type: string
  name: string
  active: boolean
  last_sync_at?: string | null
  last_sync_status?: 'queued' | 'running' | 'succeeded' | 'failed' | null
  last_sync_error?: string | null
  items_seen?: number
  items_imported?: number
  items_updated?: number
  items_failed?: number
}

type ConnectorSyncRunRow = {
  id: string
  status: string
  items_seen: number
  items_imported: number
  items_updated: number
  items_failed: number
  error?: string | null
  created_at: string
  connector_sources?: { name?: string; type?: string } | null
}

const syncStatusLabels: Record<string, string> = {
  queued: 'eingeplant',
  running: 'läuft',
  succeeded: 'erfolgreich',
  failed: 'fehlgeschlagen',
}

const connectorPresentation: Record<string, { label: string; tone: IntegrationTone; icon: typeof ShoppingBag }> = {
  shopify: { label: 'Shopify', tone: 'green', icon: ShoppingBag },
  woocommerce: { label: 'WooCommerce', tone: 'violet', icon: Store },
  feed_csv: { label: 'CSV-Feed', tone: 'amber', icon: FileSpreadsheet },
  google_merchant: { label: 'Google Merchant', tone: 'blue', icon: FileSpreadsheet },
}

async function importShopify(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  if (!hasPlan(tenant.plan, 'pro') || !['owner', 'admin'].includes(tenant.membership_role ?? 'owner')) return
  await backendFetch('/connectors/shopify/import', tenant.id, {
    method: 'POST',
    body: JSON.stringify({
      shop_domain: String(formData.get('shop_domain') ?? ''),
      access_token: String(formData.get('access_token') ?? ''),
    }),
  })
  revalidatePath('/dashboard/settings/connectors')
  revalidatePath('/dashboard/products')
}

async function createConnector(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  if (!hasPlan(tenant.plan, 'pro') || !['owner', 'admin'].includes(tenant.membership_role ?? 'owner')) return
  const type = String(formData.get('type') ?? '')
  const feedUrl = String(formData.get('feed_url') ?? '').trim()
  const body =
    type === 'woocommerce'
      ? {
        type,
        name: String(formData.get('name') ?? 'WooCommerce').trim(),
        config: {
          base_url: String(formData.get('base_url') ?? '').trim(),
          consumer_key: String(formData.get('consumer_key') ?? '').trim(),
          consumer_secret: String(formData.get('consumer_secret') ?? '').trim(),
        },
      }
      : {
        type,
        name: String(formData.get('name') ?? (type === 'google_merchant' ? 'Google Merchant Feed' : 'CSV Feed')).trim(),
        config: { url: feedUrl },
      }
  await backendFetch('/connectors', tenant.id, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  revalidatePath('/dashboard/settings/connectors')
}

async function syncConnector(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
  const response = await backendFetch('/connectors/sync-runs', tenant.id, {
    method: 'POST',
    body: JSON.stringify({ connector_id: String(formData.get('id') ?? '') }),
  })
  if (!response.ok) return { ok: false, message: 'Sync konnte nicht gestartet werden.' }
  revalidatePath('/dashboard/settings/connectors')
  revalidatePath('/dashboard/products')
  return { ok: true, message: 'Sync wurde eingeplant.' }
}

async function disconnectConnector(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
  const response = await backendFetch(`/connectors/${String(formData.get('id'))}/disconnect`, tenant.id, { method: 'POST' })
  if (!response.ok) return { ok: false, message: 'Connector konnte nicht getrennt werden.' }
  revalidatePath('/dashboard/settings/connectors')
  return { ok: true, message: 'Connector getrennt.' }
}

async function reconnectConnector(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
  const response = await backendFetch(`/connectors/${String(formData.get('id'))}/reconnect`, tenant.id, { method: 'POST' })
  if (!response.ok) return { ok: false, message: 'Connector konnte nicht verbunden werden.' }
  revalidatePath('/dashboard/settings/connectors')
  return { ok: true, message: 'Connector verbunden.' }
}

export default async function ConnectorsPage() {
  const tenant = await currentTenant()
  const canManageIntegrations =
    hasPlan(tenant?.plan, 'pro') && ['owner', 'admin'].includes(tenant?.membership_role ?? 'owner')
  let data: ConnectorSourceRow[] = []
  let runs: ConnectorSyncRunRow[] = []
  if (tenant) {
    try {
      const [sourcesResponse, runsResponse] = await Promise.all([
        backendFetch('/connectors', tenant.id),
        backendFetch('/connectors/sync-runs', tenant.id),
      ])
      if (sourcesResponse.ok) data = (await sourcesResponse.json()) as ConnectorSourceRow[]
      if (runsResponse.ok) runs = (await runsResponse.json()) as ConnectorSyncRunRow[]
    } catch {
      data = []
      runs = []
    }
  }

  const activeSources = data.filter((source) => source.active).length
  const failedSources = data.filter((source) => source.last_sync_status === 'failed').length

  return (
    <>
      <IntegrationHero
        eyebrow="Integrationen / Connectoren"
        title="Quellen verbinden. Katalog aktuell halten."
        description="Richte Shop-Systeme und Produkt-Feeds ein, starte Synchronisierungen und erkenne fehlerhafte Quellen auf einen Blick."
        icon={Cable}
        backHref="/dashboard/settings/integrations"
        backLabel="Zur Integrationsübersicht"
      >
        <HeroStat label="Quellen" value={data.length} tone="blue" />
        <HeroStat label="Aktiv" value={activeSources} tone="green" />
        <HeroStat label="Fehler" value={failedSources} tone={failedSources ? 'amber' : 'slate'} />
        <HeroStat label="Plan" value={tenant?.plan ?? 'Free'} tone="violet" />
      </IntegrationHero>

      {canManageIntegrations ? (
        <section className="animate-reveal">
          <IntegrationSectionHeading
            eyebrow="Neue Verbindung"
            title="Wähle den passenden Importweg"
            description="Direkte Shop-Verbindungen übernehmen Zugangsdaten; Feed-Connectoren benötigen nur eine öffentlich erreichbare Feed-URL."
          />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <section id="shopify" className="relative scroll-mt-24 overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel transition hover:border-vault-500 hover:shadow-[0_14px_35px_rgba(48,48,48,0.08)]">
              <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden="true" />
              <div className="flex items-center justify-between gap-4 border-b border-vault-800 px-5 py-4 pl-6">
                <div className="flex min-w-0 items-center gap-3">
                  <IntegrationIcon icon={ShoppingBag} tone="green" className="h-10 w-10 rounded-lg" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />Direktimport</p>
                    <h2 className="mt-1 truncate text-base font-bold text-vault-100">Shopify</h2>
                  </div>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-vault-500">Admin API</span>
              </div>
              <form action={importShopify} className="grid gap-3 p-5 pl-6">
                <label>
                  <span className="field-label">Shopify-Domain</span>
                  <input className="field" name="shop_domain" placeholder="meinshop.myshopify.com" required />
                </label>
                <label>
                  <span className="field-label">Admin-Zugriffstoken</span>
                  <input className="field" name="access_token" type="password" required />
                </label>
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-vault-800 pt-4">
                  <span className="hidden text-xs text-vault-500 sm:block">Produkte und Varianten importieren</span>
                  <button className="button-primary min-w-44">Verbinden</button>
                </div>
              </form>
            </section>

            <section id="woocommerce" className="relative scroll-mt-24 overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel transition hover:border-vault-500 hover:shadow-[0_14px_35px_rgba(48,48,48,0.08)]">
              <div className="absolute inset-y-0 left-0 w-1 bg-violet-500" aria-hidden="true" />
              <div className="flex items-center justify-between gap-4 border-b border-vault-800 px-5 py-4 pl-6">
                <div className="flex min-w-0 items-center gap-3">
                  <IntegrationIcon icon={Store} tone="violet" className="h-10 w-10 rounded-lg" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden="true" />Shop API</p>
                    <h2 className="mt-1 truncate text-base font-bold text-vault-100">WooCommerce</h2>
                  </div>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-vault-500">REST API</span>
              </div>
              <form action={createConnector} className="grid gap-3 p-5 pl-6">
                <input type="hidden" name="type" value="woocommerce" />
                <input type="hidden" name="name" value="WooCommerce" />
                <label>
                  <span className="field-label">Shop-URL</span>
                  <input className="field" name="base_url" type="url" placeholder="https://shop.example" required />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="field-label">Consumer Key</span>
                    <input className="field" name="consumer_key" required />
                  </label>
                  <label>
                    <span className="field-label">Consumer Secret</span>
                    <input className="field" name="consumer_secret" type="password" required />
                  </label>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-vault-800 pt-4">
                  <span className="hidden text-xs text-vault-500 sm:block">Zugang verschlüsselt speichern</span>
                  <button className="button-primary min-w-44">Verbinden</button>
                </div>
              </form>
            </section>

            <section id="feeds" className="relative scroll-mt-24 overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel transition hover:border-vault-500 hover:shadow-[0_14px_35px_rgba(48,48,48,0.08)]">
              <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" aria-hidden="true" />
              <div className="flex items-center justify-between gap-4 border-b border-vault-800 px-5 py-4 pl-6">
                <div className="flex min-w-0 items-center gap-3">
                  <IntegrationIcon icon={FileSpreadsheet} tone="amber" className="h-10 w-10 rounded-lg" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />Datei-Feed</p>
                    <h2 className="mt-1 truncate text-base font-bold text-vault-100">CSV-Feed</h2>
                  </div>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-vault-500">CSV / URL</span>
              </div>
              <form action={createConnector} className="grid gap-3 p-5 pl-6">
                <input type="hidden" name="type" value="feed_csv" />
                <input type="hidden" name="name" value="CSV Feed" />
                <p className="text-xs leading-5 text-vault-500">Für strukturierte Produktdaten aus ERP, PIM oder eigenem Export.</p>
                <label>
                  <span className="field-label">Feed-URL</span>
                  <input className="field" name="feed_url" type="url" placeholder="https://example.de/products.csv" required />
                </label>
                <div className="mt-1 flex justify-end border-t border-vault-800 pt-4">
                  <button className="button-secondary min-w-44">Feed speichern</button>
                </div>
              </form>
            </section>

            <section className="relative overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel transition hover:border-vault-500 hover:shadow-[0_14px_35px_rgba(48,48,48,0.08)]">
              <div className="absolute inset-y-0 left-0 w-1 bg-sky-500" aria-hidden="true" />
              <div className="flex items-center justify-between gap-4 border-b border-vault-800 px-5 py-4 pl-6">
                <div className="flex min-w-0 items-center gap-3">
                  <IntegrationIcon icon={FileSpreadsheet} tone="blue" className="h-10 w-10 rounded-lg" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true" />Commerce-Feed</p>
                    <h2 className="mt-1 truncate text-base font-bold text-vault-100">Google Merchant</h2>
                  </div>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-vault-500">XML / URL</span>
              </div>
              <form action={createConnector} className="grid gap-3 p-5 pl-6">
                <input type="hidden" name="type" value="google_merchant" />
                <input type="hidden" name="name" value="Google Merchant Feed" />
                <p className="text-xs leading-5 text-vault-500">Vorhandenen Merchant-Feed direkt als Katalogquelle weiterverwenden.</p>
                <label>
                  <span className="field-label">Feed-URL</span>
                  <input className="field" name="feed_url" type="url" placeholder="https://example.de/merchant.xml" required />
                </label>
                <div className="mt-1 flex justify-end border-t border-vault-800 pt-4">
                  <button className="button-secondary min-w-44">Feed speichern</button>
                </div>
              </form>
            </section>
          </div>
        </section>
      ) : (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div><strong>Verwaltung gesperrt.</strong><p className="mt-1 text-amber-900/75">Connectoren können nur Owner und Admins ab dem Pro-Plan verwalten.</p></div>
          </div>
        </div>
      )}

      <section className="mt-9" aria-labelledby="connected-sources-title">
        <IntegrationSectionHeading
          eyebrow="Quellen-Monitor"
          title="Verbundene Quellen"
          description="Status, letzter Lauf und verarbeitete Datensätze je Connector."
          action={<IntegrationBadge tone={failedSources ? 'amber' : 'green'}>{failedSources ? `${failedSources} mit Fehler` : 'Alle Systeme normal'}</IntegrationBadge>}
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {data.map((source) => (
            <article key={source.id} className="overflow-hidden rounded-3xl border border-vault-700 bg-white shadow-panel transition hover:border-vault-500 hover:shadow-[0_16px_45px_rgba(48,48,48,0.09)]">
              <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
                <div className="flex min-w-0 items-start gap-4">
                  <IntegrationIcon icon={(connectorPresentation[source.type] ?? connectorPresentation.feed_csv).icon} tone={(connectorPresentation[source.type] ?? connectorPresentation.feed_csv).tone} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-bold text-vault-100">{source.name}</h3>
                      <IntegrationBadge tone={source.active ? 'green' : 'slate'}>{source.active ? 'Aktiv' : 'Getrennt'}</IntegrationBadge>
                    </div>
                    <p className="mt-2 text-xs text-vault-500">
                      {connectorPresentation[source.type]?.label ?? source.type} · {source.last_sync_status ? syncStatusLabels[source.last_sync_status] : 'noch nicht synchronisiert'}
                    </p>
                  </div>
                </div>
                {source.last_sync_status === 'succeeded' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Letzter Lauf erfolgreich" /> : null}
              </div>
              <div className="grid grid-cols-4 border-y border-vault-800 bg-vault-950/60">
                {[
                  ['Gesehen', source.items_seen ?? 0],
                  ['Importiert', source.items_imported ?? 0],
                  ['Aktualisiert', source.items_updated ?? 0],
                  ['Fehler', source.items_failed ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="border-r border-vault-800 p-3 last:border-r-0 sm:p-4">
                    <p className="truncate text-[9px] font-bold uppercase tracking-[0.08em] text-vault-500">{label}</p>
                    <p className="mt-2 font-mono text-sm font-bold text-vault-100">{value}</p>
                  </div>
                ))}
              </div>
              {source.last_sync_error ? <p className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 sm:mx-6">{source.last_sync_error}</p> : null}
              {canManageIntegrations && (
                <div className="flex flex-wrap gap-2 p-5 sm:justify-end sm:p-6">
                  <MutationButton id={source.id} label="Synchronisieren" pendingLabel="Wird eingeplant …" action={syncConnector} tone="neutral" />
                  {source.active ? (
                    <MutationButton id={source.id} label="Trennen" pendingLabel="Wird getrennt …" action={disconnectConnector} />
                  ) : (
                    <MutationButton id={source.id} label="Verbinden" pendingLabel="Wird verbunden …" action={reconnectConnector} tone="neutral" />
                  )}
                </div>
              )}
            </article>
          ))}
          {!data.length && (
            <div className="rounded-3xl border border-dashed border-vault-700 bg-white p-8 text-center xl:col-span-2">
              <Workflow className="mx-auto h-7 w-7 text-vault-500" aria-hidden="true" />
              <h3 className="mt-4 font-bold text-vault-100">Noch keine Connectoren eingerichtet</h3>
              <p className="mt-2 text-sm text-vault-500">Wähle oben ein Shop-System oder einen Feed aus, um den ersten Datenfluss zu starten.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-9 overflow-hidden rounded-3xl border border-vault-700 bg-white shadow-panel" aria-labelledby="sync-runs-title">
        <div className="flex flex-col justify-between gap-3 border-b border-vault-700 bg-vault-100 p-5 text-white sm:flex-row sm:items-center sm:p-6">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Sync-Verlauf</p>
            <h2 id="sync-runs-title" className="mt-2 text-xl font-bold">Letzte Läufe</h2>
          </div>
          <span className="font-mono text-xs text-white/45">{runs.length} EINTRÄGE</span>
        </div>
        <div className="divide-y divide-vault-800">
          {runs.slice(0, 8).map((run) => (
            <article key={run.id} className="grid gap-3 p-5 text-sm transition hover:bg-vault-950/60 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${run.status === 'succeeded' ? 'bg-emerald-500' : run.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden="true" />
                <div>
                  <p className="font-semibold text-vault-100">{run.connector_sources?.name ?? 'Connector'}</p>
                  <p className="mt-1 text-xs text-vault-500">{syncStatusLabels[run.status] ?? run.status} · {run.items_seen} Datensätze gesehen</p>
                </div>
              </div>
              <div className="flex gap-4 font-mono text-xs text-vault-500 sm:justify-end">
                <span><strong className="text-vault-100">{run.items_imported}</strong> neu</span>
                <span><strong className="text-vault-100">{run.items_updated}</strong> aktualisiert</span>
              </div>
              {run.error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 sm:col-span-2">{run.error}</p>}
            </article>
          ))}
          {!runs.length && <p className="p-5 text-sm text-vault-400">Noch kein Sync-Lauf vorhanden.</p>}
        </div>
      </section>
    </>
  )
}
