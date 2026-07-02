import { revalidatePath } from 'next/cache'

import { APIKeyCreateForm } from './APIKeyCreateForm'
import { PageHeader } from '@/components/ui/MerchantUI'
import { backendFetch, currentTenant } from '@/lib/backend'
import { hasPlan } from '@/lib/plan-gates'

type APIKeyRow = {
  id: string
  name: string
  created_at: string
  last_used: string | null
  revoked: boolean
}

async function createKey(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
  if (!hasPlan(tenant.plan, 'pro') || !['owner', 'admin'].includes(tenant.membership_role ?? 'owner')) {
    return { ok: false, message: 'Nur Owner und Admins im Pro-Plan dürfen API-Keys verwalten.' }
  }
  const response = await backendFetch('/api-keys', tenant.id, {
    method: 'POST',
    body: JSON.stringify({ name: String(formData.get('name') ?? 'Integration') }),
  })
  if (!response.ok) return { ok: false, message: `API-Key konnte nicht erstellt werden (${response.status}).` }
  const payload = (await response.json()) as { key?: string }
  revalidatePath('/dashboard/settings/api-keys')
  return {
    ok: true,
    key: payload.key,
    message: 'API-Key erstellt. Speichere ihn jetzt, er wird danach nicht erneut angezeigt.',
  }
}

async function revokeKey(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  if (!hasPlan(tenant.plan, 'pro') || !['owner', 'admin'].includes(tenant.membership_role ?? 'owner')) return
  await backendFetch(`/api-keys/${String(formData.get('id'))}`, tenant.id, { method: 'DELETE' })
  revalidatePath('/dashboard/settings/api-keys')
}

export default async function APIKeysPage() {
  const tenant = await currentTenant()
  const canManageIntegrations =
    hasPlan(tenant?.plan, 'pro') && ['owner', 'admin'].includes(tenant?.membership_role ?? 'owner')
  let data: APIKeyRow[] = []
  if (tenant) {
    const response = await backendFetch('/api-keys', tenant.id)
    if (response.ok) data = (await response.json()) as APIKeyRow[]
  }

  return (
    <>
      <PageHeader eyebrow="Integrationen" title="API-Keys" description="Zugriffsschlüssel für sichere externe Integrationen verwalten." />
      {canManageIntegrations ? (
        <section className="panel p-5">
          <APIKeyCreateForm action={createKey} />
        </section>
      ) : (
        <div className="panel border-l-2 border-l-merchant-success p-5 text-sm text-vault-300">
          API-Keys können nur Owner und Admins ab dem Pro-Plan verwalten.
        </div>
      )}
      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-vault-700 px-5 py-4 font-semibold">Bestehende Keys</div>
        <div className="divide-y divide-vault-700/70">
          {data.map((key) => (
            <article key={key.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">{key.name}</h2>
                <p className="mt-1 font-mono text-xs text-vault-500">{key.revoked ? 'Widerrufen' : 'Aktiv'} · zuletzt genutzt: {key.last_used ?? 'nie'}</p>
              </div>
              {!key.revoked && canManageIntegrations && (
                <form action={revokeKey}>
                  <input type="hidden" name="id" value={key.id} />
                  <button className="text-xs font-semibold text-red-700">Widerrufen</button>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
