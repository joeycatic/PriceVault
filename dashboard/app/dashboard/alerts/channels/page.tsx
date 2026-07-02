import { revalidatePath } from 'next/cache'

import { backendFetch, currentTenant } from '@/lib/backend'
import { hasPlan } from '@/lib/plan-gates'

type AlertChannelRow = {
  id: string
  type: 'webhook' | 'slack'
  config: { url?: string; webhook_url?: string }
  active: boolean
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

export default async function AlertChannelsPage() {
  const tenant = await currentTenant()
  const canManageIntegrations =
    hasPlan(tenant?.plan, 'pro') && ['owner', 'admin'].includes(tenant?.membership_role ?? 'owner')
  let data: AlertChannelRow[] = []
  if (tenant) {
    const response = await backendFetch('/alert-channels', tenant.id)
    if (response.ok) data = (await response.json()) as AlertChannelRow[]
  }

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Preisalarme</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Kanäle</h1>
      </header>
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
        <div className="panel border-l-2 border-l-vault-lime p-5 text-sm text-vault-300">
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
                <form action={deleteChannel}>
                  <input type="hidden" name="id" value={channel.id} />
                  <button className="text-xs font-semibold text-red-300">Entfernen</button>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
