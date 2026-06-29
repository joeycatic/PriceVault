import { revalidatePath } from 'next/cache'

import { AlertForm } from '@/components/ui/AlertForm'
import { createClient } from '@/lib/supabase/server'
import type { Alert, Competitor, Product, Tenant } from '@/lib/types'

const conditionLabels: Record<Alert['condition'], string> = {
  below_pct: 'Mitbewerber günstiger als du',
  above_pct: 'Mitbewerber teurer als du',
  below_abs: 'Mitbewerber absolut günstiger',
  above_abs: 'Mitbewerber absolut teurer',
}

export default async function AlertsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: tenantData } = await supabase.from('tenants').select('*').eq('user_id', user!.id).maybeSingle()
  const tenant = tenantData as Tenant | null
  const [alertResult, productResult, competitorResult] = tenant
    ? await Promise.all([
        supabase.from('alerts').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
        supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('active', true).order('name'),
        supabase.from('competitors').select('*').eq('tenant_id', tenant.id).eq('active', true).order('shop_name'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]
  const alerts = (alertResult.data ?? []) as Alert[]
  const products = (productResult.data ?? []) as Product[]
  const competitors = (competitorResult.data ?? []) as Competitor[]

  async function saveAction(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = createClient()
    const values = {
      product_id: String(formData.get('product_id') || '') || null,
      competitor_id: String(formData.get('competitor_id') || '') || null,
      condition: String(formData.get('condition')),
      threshold: Number(formData.get('threshold')),
      notify_email: String(formData.get('notify_email')),
      cooldown_h: Number(formData.get('cooldown_h')),
    }
    const id = String(formData.get('id') || '')
    const result = id
      ? await client.from('alerts').update(values).eq('tenant_id', tenant.id).eq('id', id)
      : await client.from('alerts').insert({ ...values, tenant_id: tenant.id })
    if (result.error) return { ok: false, message: 'Der Preisalarm konnte nicht gespeichert werden.' }
    revalidatePath('/dashboard/alerts')
    return { ok: true, message: id ? 'Preisalarm wurde aktualisiert.' : 'Preisalarm wurde angelegt.' }
  }

  async function deleteAlert(formData: FormData) {
    'use server'
    if (!tenant) return
    const client = createClient()
    await client.from('alerts').delete().eq('tenant_id', tenant.id).eq('id', String(formData.get('id')))
    revalidatePath('/dashboard/alerts')
  }

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Benachrichtigungen</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Preisalarme</h1>
        <p className="mt-2 text-sm text-vault-300">Reagiere, sobald ein Mitbewerber deine festgelegte Preisschwelle überschreitet.</p>
      </header>

      {!tenant ? (
        <div className="panel p-6 text-sm text-amber-100">Für dieses Konto wurde noch kein Mandant eingerichtet.</div>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(380px,.85fr)_minmax(0,1.15fr)]">
          <section className="panel p-5 sm:p-6" aria-labelledby="new-alert">
            <p className="eyebrow">Neue Regel</p>
            <h2 id="new-alert" className="mb-6 mt-2 text-xl font-semibold">Preisalarm anlegen</h2>
            <AlertForm products={products} competitors={competitors} saveAction={saveAction} />
          </section>

          <section className="space-y-3" aria-labelledby="alert-list">
            <h2 id="alert-list" className="sr-only">Eingerichtete Preisalarme</h2>
            {alerts.length ? alerts.map((alert) => {
              const product = products.find((item) => item.id === alert.product_id)
              const competitor = competitors.find((item) => item.id === alert.competitor_id)
              const suffix = alert.condition.endsWith('_pct') ? '%' : '€'
              return (
                <article key={alert.id} className="panel p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${alert.active ? 'bg-vault-lime' : 'bg-vault-500'}`} />
                        <h3 className="font-semibold">{conditionLabels[alert.condition]}</h3>
                      </div>
                      <p className="mt-2 text-sm text-vault-300">
                        {product?.name ?? 'Alle Produkte'} · {competitor?.shop_name ?? 'Alle Mitbewerber'}
                      </p>
                      <p className="mt-3 font-mono text-xs text-vault-500">
                        Grenzwert {Number(alert.threshold).toLocaleString('de-DE')} {suffix} · Ruhezeit {alert.cooldown_h} Std.
                      </p>
                    </div>
                    <form action={deleteAlert}>
                      <input type="hidden" name="id" value={alert.id} />
                      <button className="text-xs font-semibold text-red-300 hover:text-red-200">Löschen</button>
                    </form>
                  </div>
                  <details className="mt-4 border-t border-vault-700 pt-4">
                    <summary className="cursor-pointer text-xs font-semibold text-vault-300 hover:text-vault-lime">Regel bearbeiten</summary>
                    <div className="mt-5">
                      <AlertForm alert={alert} products={products} competitors={competitors} saveAction={saveAction} />
                    </div>
                  </details>
                </article>
              )
            }) : (
              <div className="panel p-6 text-sm text-vault-300">Noch keine Preisalarme eingerichtet.</div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

