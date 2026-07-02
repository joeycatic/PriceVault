import { revalidatePath } from 'next/cache'

import { backendFetch, currentTenant } from '@/lib/backend'
import { PageHeader } from '@/components/ui/MerchantUI'
import { MutationButton } from '@/components/ui/MutationButton'
import { hasPlan } from '@/lib/plan-gates'

type AlertChannelRow = {
  id: string
  type: 'webhook' | 'slack'
  config: { url?: string; webhook_url?: string }
  active: boolean
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
  await backendFetch('/alert-channels', tenant.id, {
    method: 'POST',
    body: JSON.stringify({
      type,
      config: type === 'slack' ? { webhook_url: url } : { url },
    }),
  })
  revalidatePath('/dashboard/alerts/channels')
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

export default async function AlertChannelsPage() {
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
      <PageHeader eyebrow="Preisalarme" title="Kanäle" description="Webhook- und Slack-Ziele für automatische Benachrichtigungen verwalten." />
      {canManageIntegrations ? (
        <section className="panel p-5">
          <form action={createChannel} className="grid gap-3 lg:grid-cols-[180px_1fr_auto]">
            <label>
              <span className="field-label">Typ</span>
              <select className="field" name="type" defaultValue="webhook">
                <option value="webhook">Webhook</option>
                <option value="slack">Slack</option>
              </select>
            </label>
            <label>
              <span className="field-label">URL</span>
              <input className="field" name="url" type="url" required />
            </label>
            <button className="button-primary self-end">Kanal speichern</button>
          </form>
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
            <article key={channel.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">{channel.type}</h2>
                <p className="mt-1 max-w-2xl truncate font-mono text-xs text-vault-500">
                  {channel.config?.url ?? channel.config?.webhook_url}
                </p>
              </div>
              {canManageIntegrations && (
                <div className="flex gap-2">
                  <MutationButton id={channel.id} label="Test" pendingLabel="Sendet …" action={testChannel} tone="neutral" />
                  <form action={deleteChannel}>
                    <input type="hidden" name="id" value={channel.id} />
                    <button className="text-xs font-semibold text-red-700">Entfernen</button>
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
                <span>{delivery.channel_type} · {delivery.status}</span>
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
