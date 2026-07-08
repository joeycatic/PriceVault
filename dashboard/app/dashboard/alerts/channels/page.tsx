import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Radio, Send, Trash2, Webhook } from 'lucide-react'

import { backendFetch, currentTenant } from '@/lib/backend'
import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { MutationButton } from '@/components/ui/MutationButton'
import { hasPlan } from '@/lib/plan-gates'

type AlertChannelRow = {
  id: string
  type: 'webhook' | 'slack' | 'teams'
  config: { url?: string; webhook_url?: string }
  active: boolean
  signing_secret?: string
}

type DeliveryRow = {
  id: string
  channel_type: string
  status: string
  attempt_count: number
  last_error?: string | null
  created_at: string
}

async function createChannel(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  if (!hasPlan(tenant.plan, 'pro') || !['owner', 'admin'].includes(tenant.membership_role ?? 'owner')) return
  const type = String(formData.get('type') ?? 'webhook')
  const url = String(formData.get('url') ?? '')
  const response = await backendFetch('/alert-channels', tenant.id, {
    method: 'POST',
    body: JSON.stringify({
      type,
      config: type === 'slack' || type === 'teams' ? { webhook_url: url } : { url },
    }),
  })
  revalidatePath('/dashboard/alerts/channels')
  const payload = await response.json().catch(() => ({}))
  if (payload.signing_secret) {
    redirect(`/dashboard/alerts/channels?secret=${encodeURIComponent(payload.signing_secret)}`)
  }
}

async function deleteChannel(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  if (!hasPlan(tenant.plan, 'pro') || !['owner', 'admin'].includes(tenant.membership_role ?? 'owner')) return
  await backendFetch(`/alert-channels/${String(formData.get('id'))}`, tenant.id, { method: 'DELETE' })
  revalidatePath('/dashboard/alerts/channels')
}

async function testChannel(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
  if (!hasPlan(tenant.plan, 'pro') || !['owner', 'admin'].includes(tenant.membership_role ?? 'owner')) return { ok: false, message: 'Keine Berechtigung.' }
  const response = await backendFetch(`/alert-channels/${String(formData.get('id'))}/test`, tenant.id, { method: 'POST' })
  if (!response.ok) return { ok: false, message: 'Test konnte nicht gesendet werden.' }
  revalidatePath('/dashboard/alerts/channels')
  return { ok: true, message: 'Test wurde gesendet.' }
}

export default async function AlertChannelsPage({
  searchParams,
}: {
  searchParams?: Promise<{ secret?: string }>
}) {
  const params = await searchParams
  const tenant = await currentTenant()
  const canManageIntegrations =
    hasPlan(tenant?.plan, 'pro') && ['owner', 'admin'].includes(tenant?.membership_role ?? 'owner')
  let data: AlertChannelRow[] = []
  let deliveries: DeliveryRow[] = []
  if (tenant) {
    try {
      const [response, deliveryResponse] = await Promise.all([
        backendFetch('/alert-channels', tenant.id),
        backendFetch('/alert-channels/deliveries', tenant.id),
      ])
      if (response.ok) data = (await response.json()) as AlertChannelRow[]
      if (deliveryResponse.ok) deliveries = (await deliveryResponse.json()) as DeliveryRow[]
    } catch {
      data = []
      deliveries = []
    }
  }

  return (
    <>
      <PageHeader eyebrow="Preisalarme" title="Kanäle" description="Webhook-, Slack- und Teams-Ziele für automatische Benachrichtigungen verwalten." />
      <div className="mb-6">
        <MetricGrid items={[
          { label: 'Aktive Kanäle', value: data.filter((channel) => channel.active).length, tone: data.length ? 'success' : 'neutral' },
          { label: 'Zustellungen', value: deliveries.length, detail: 'Historie geladen' },
          { label: 'Plan-Zugriff', value: canManageIntegrations ? 'Aktiv' : 'Gesperrt', tone: canManageIntegrations ? 'success' : 'warning' },
          { label: 'Typen', value: 'Webhook / Slack / Teams' },
        ]} />
      </div>
      {params?.secret && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Signatur-Secret — wird nur einmal angezeigt.</p>
          <p className="mt-1 leading-6">Verifiziere eingehende Webhooks mit HMAC-SHA256 über &quot;timestamp.body&quot;.</p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-xs text-vault-100">{params.secret}</code>
        </div>
      )}
      {canManageIntegrations ? (
        <section className="panel overflow-hidden">
          <div className="border-b border-vault-700 bg-vault-100 p-5 text-white">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
              <Radio className="h-4 w-4" aria-hidden="true" />
              Neuer Kanal
            </p>
            <h2 className="mt-2 text-xl font-bold">Benachrichtigungsziel verbinden</h2>
          </div>
          <div className="p-5">
          <form action={createChannel} className="grid gap-3 lg:grid-cols-[180px_1fr_auto]">
            <label>
              <span className="field-label">Typ</span>
              <select className="field" name="type" defaultValue="webhook">
                <option value="webhook">Webhook</option>
                <option value="slack">Slack</option>
                <option value="teams">Microsoft Teams</option>
              </select>
            </label>
            <label>
              <span className="field-label">URL</span>
              <input className="field" name="url" type="url" required />
            </label>
            <button className="button-primary self-end">Kanal speichern</button>
          </form>
          </div>
        </section>
      ) : (
        <div className="panel border-l-2 border-l-merchant-success p-5 text-sm text-vault-300">
          Alert-Kanäle können nur Owner und Admins ab dem Pro-Plan verwalten.
        </div>
      )}
      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-vault-700 px-5 py-4 font-semibold">Aktive Kanäle</div>
        <div className="divide-y divide-vault-700/70">
          {data.map((channel) => (
            <article key={channel.id} className="flex flex-col gap-3 p-5 transition hover:bg-vault-950 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-vault-950 text-vault-100">
                  <Webhook className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                <h2 className="font-semibold">{channel.type}</h2>
                <p className="mt-1 max-w-2xl truncate font-mono text-xs text-vault-500">
                  {channel.config?.url ?? channel.config?.webhook_url}
                </p>
                </div>
              </div>
              {canManageIntegrations && (
                <div className="flex gap-2">
                  <MutationButton id={channel.id} label="Test" pendingLabel="Sendet …" action={testChannel} tone="neutral" />
                  <form action={deleteChannel}>
                    <input type="hidden" name="id" value={channel.id} />
                    <button className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-800 transition hover:bg-red-100" aria-label="Kanal entfernen">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>
                </div>
              )}
            </article>
          ))}
          {!data.length && <p className="p-5 text-sm text-vault-400">Noch keine Alert-Kanäle eingerichtet.</p>}
        </div>
      </section>
      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-vault-700 px-5 py-4 font-semibold">Zustellhistorie</div>
        <div className="divide-y divide-vault-700/70">
          {deliveries.map((delivery) => (
            <article key={delivery.id} className="p-5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Send className="h-4 w-4 text-vault-500" aria-hidden="true" />{delivery.channel_type} · {delivery.status}</span>
                <span className="font-mono text-xs text-vault-500">{delivery.attempt_count} Versuch(e)</span>
              </div>
              {delivery.last_error && <p className="mt-2 text-xs text-red-700">{delivery.last_error}</p>}
            </article>
          ))}
          {!deliveries.length && <p className="p-5 text-sm text-vault-400">Noch keine Zustellversuche.</p>}
        </div>
      </section>
    </>
  )
}
