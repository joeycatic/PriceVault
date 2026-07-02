import { revalidatePath } from 'next/cache'

import { backendFetch, currentTenant } from '@/lib/backend'
import { hasPlan } from '@/lib/plan-gates'

type ConnectorSourceRow = {
  id: string
  type: string
  name: string
  active: boolean
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

export default async function ConnectorsPage() {
  const tenant = await currentTenant()
  const canManageIntegrations =
    hasPlan(tenant?.plan, 'pro') && ['owner', 'admin'].includes(tenant?.membership_role ?? 'owner')
  let data: ConnectorSourceRow[] = []
  if (tenant) {
    const response = await backendFetch('/connectors', tenant.id)
    if (response.ok) data = (await response.json()) as ConnectorSourceRow[]
  }

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Import</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Connectoren</h1>
      </header>
      {canManageIntegrations ? (
        <section className="panel p-5">
          <form action={importShopify} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <label>
              <span className="field-label">Shopify-Domain</span>
              <input className="field" name="shop_domain" placeholder="meinshop.myshopify.com" required />
            </label>
            <label>
              <span className="field-label">Admin-Zugriffstoken</span>
              <input className="field" name="access_token" type="password" required />
            </label>
            <button className="button-primary self-end">Import starten</button>
          </form>
        </section>
      ) : (
        <div className="panel border-l-2 border-l-vault-lime p-5 text-sm text-vault-300">
          Connectoren können nur Owner und Admins ab dem Pro-Plan verwalten.
        </div>
      )}
      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-vault-700 px-5 py-4 font-semibold">Quellen</div>
        <div className="divide-y divide-vault-700/70">
          {data.map((source) => (
            <article key={source.id} className="p-5">
              <h2 className="font-semibold">{source.name}</h2>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-vault-500">{source.type} · {source.active ? 'aktiv' : 'inaktiv'}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
