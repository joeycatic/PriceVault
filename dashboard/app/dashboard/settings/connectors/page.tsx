import { revalidatePath } from 'next/cache'

import { PageHeader } from '@/components/ui/MerchantUI'
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

  return (
    <>
      <PageHeader eyebrow="Import" title="Connectoren" description="Shop-Verbindungen einrichten und synchronisierte Quellen überwachen." />
      {canManageIntegrations ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="panel p-5">
            <h2 className="font-semibold">Shopify verbinden</h2>
            <form action={importShopify} className="mt-4 grid gap-3">
              <label>
                <span className="field-label">Shopify-Domain</span>
                <input className="field" name="shop_domain" placeholder="meinshop.myshopify.com" required />
              </label>
              <label>
                <span className="field-label">Admin-Zugriffstoken</span>
                <input className="field" name="access_token" type="password" required />
              </label>
              <button className="button-primary">Import starten</button>
            </form>
          </section>

          <section className="panel p-5">
            <h2 className="font-semibold">WooCommerce verbinden</h2>
            <form action={createConnector} className="mt-4 grid gap-3">
              <input type="hidden" name="type" value="woocommerce" />
              <input type="hidden" name="name" value="WooCommerce" />
              <label>
                <span className="field-label">Shop-URL</span>
                <input className="field" name="base_url" type="url" placeholder="https://shop.example" required />
              </label>
              <label>
                <span className="field-label">Consumer Key</span>
                <input className="field" name="consumer_key" required />
              </label>
              <label>
                <span className="field-label">Consumer Secret</span>
                <input className="field" name="consumer_secret" type="password" required />
              </label>
              <button className="button-primary">Connector speichern</button>
            </form>
          </section>

          <section className="panel p-5">
            <h2 className="font-semibold">CSV-Feed verbinden</h2>
            <form action={createConnector} className="mt-4 grid gap-3">
              <input type="hidden" name="type" value="feed_csv" />
              <input type="hidden" name="name" value="CSV Feed" />
              <label>
                <span className="field-label">Feed-URL</span>
                <input className="field" name="feed_url" type="url" required />
              </label>
              <button className="button-primary">Feed speichern</button>
            </form>
          </section>

          <section className="panel p-5">
            <h2 className="font-semibold">Google Merchant Feed verbinden</h2>
            <form action={createConnector} className="mt-4 grid gap-3">
              <input type="hidden" name="type" value="google_merchant" />
              <input type="hidden" name="name" value="Google Merchant Feed" />
              <label>
                <span className="field-label">Feed-URL</span>
                <input className="field" name="feed_url" type="url" required />
              </label>
              <button className="button-primary">Feed speichern</button>
            </form>
          </section>
        </div>
      ) : (
        <div className="panel border-l-2 border-l-merchant-success p-5 text-sm text-vault-300">
          Connectoren können nur Owner und Admins ab dem Pro-Plan verwalten.
        </div>
      )}
      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-vault-700 px-5 py-4 font-semibold">Quellen</div>
        <div className="divide-y divide-vault-700/70">
          {data.map((source) => (
            <article key={source.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold">{source.name}</h2>
                <p className="mt-1 text-xs text-vault-500">
                  {source.type} · {source.active ? 'aktiv' : 'inaktiv'} · Status {source.last_sync_status ? syncStatusLabels[source.last_sync_status] : 'noch nicht synchronisiert'}
                </p>
                <p className="mt-2 text-xs text-vault-400">
                  Gesehen {source.items_seen ?? 0} · Importiert {source.items_imported ?? 0} · Aktualisiert {source.items_updated ?? 0} · Fehler {source.items_failed ?? 0}
                </p>
                {source.last_sync_error && <p className="mt-2 text-xs text-red-700">{source.last_sync_error}</p>}
              </div>
              {canManageIntegrations && (
                <div className="flex flex-wrap gap-2 lg:justify-end">
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
          {!data.length && <p className="p-5 text-sm text-vault-400">Noch keine Connectoren eingerichtet.</p>}
        </div>
      </section>
      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-vault-700 px-5 py-4 font-semibold">Letzte Sync-Läufe</div>
        <div className="divide-y divide-vault-700/70">
          {runs.slice(0, 8).map((run) => (
            <article key={run.id} className="p-5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>{run.connector_sources?.name ?? 'Connector'} · {syncStatusLabels[run.status] ?? run.status}</span>
                <span className="font-mono text-xs text-vault-500">{run.items_imported} neu / {run.items_updated} aktualisiert</span>
              </div>
              {run.error && <p className="mt-2 text-xs text-red-700">{run.error}</p>}
            </article>
          ))}
          {!runs.length && <p className="p-5 text-sm text-vault-400">Noch kein Sync-Lauf vorhanden.</p>}
        </div>
      </section>
    </>
  )
}
