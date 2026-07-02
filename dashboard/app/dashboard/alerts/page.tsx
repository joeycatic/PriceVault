import { revalidatePath } from 'next/cache'

import { AlertForm } from '@/components/ui/AlertForm'
import { PageHeader } from '@/components/ui/MerchantUI'
import { currentTenant } from '@/lib/backend'
import { planLimit } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import type { Alert, Competitor, Product } from '@/lib/types'

const conditionLabels: Record<Alert['condition'], string> = {
  below_pct: 'Mitbewerber günstiger als du',
  above_pct: 'Mitbewerber teurer als du',
  below_abs: 'Mitbewerber absolut günstiger',
  above_abs: 'Mitbewerber absolut teurer',
  undercut_abs: 'Mitbewerber unterbietet dich',
  out_of_stock: 'Quelle nicht verfügbar',
  back_in_stock: 'Quelle wieder verfügbar',
}

export default async function AlertsPage() {
  const supabase = await createClient()
  const tenant = await currentTenant()
  const [alertResult, productResult, competitorResult, eventResult, deliveryResult] = tenant
    ? await Promise.all([
        supabase.from('alerts').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
        supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('active', true).order('name'),
        supabase.from('competitors').select('*').eq('tenant_id', tenant.id).eq('active', true).order('shop_name'),
        supabase.from('alert_events').select('*').eq('tenant_id', tenant.id).order('triggered_at', { ascending: false }).limit(10),
        supabase.from('alert_channel_deliveries').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(10),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]
  const alerts = (alertResult.data ?? []) as Alert[]
  const products = (productResult.data ?? []) as Product[]
  const competitors = (competitorResult.data ?? []) as Competitor[]
  const events = eventResult.data ?? []
  const deliveries = deliveryResult.data ?? []
  const alertLimit = planLimit(tenant?.plan).alerts

  async function saveAction(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const condition = String(formData.get('condition'))
    const thresholdRaw = String(formData.get('threshold') ?? '').trim()
    const values = {
      product_id: String(formData.get('product_id') || '') || null,
      competitor_id: String(formData.get('competitor_id') || '') || null,
      condition,
      threshold: ['out_of_stock', 'back_in_stock'].includes(condition) ? null : Number(thresholdRaw),
      notify_email: String(formData.get('notify_email')),
      cooldown_h: Number(formData.get('cooldown_h')),
    }
    const id = String(formData.get('id') || '')
    const limit = planLimit(tenant.plan).alerts
    if (!id && limit !== null) {
      const { count, error: countError } = await client
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('active', true)
      if (countError) return { ok: false, message: 'Das Preisalarm-Limit konnte nicht geprüft werden.' }
      if ((count ?? 0) >= limit) {
        return { ok: false, message: `Dein Plan erlaubt maximal ${limit} aktive Preisalarme.` }
      }
    }
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
    const client = await createClient()
    await client.from('alerts').delete().eq('tenant_id', tenant.id).eq('id', String(formData.get('id')))
    revalidatePath('/dashboard/alerts')
  }

  return (
    <>
      <PageHeader
        eyebrow="Benachrichtigungen"
        title="Preisalarme"
        description="Reagiere, sobald ein Mitbewerber deine festgelegte Preisschwelle überschreitet."
      />

      {!tenant ? (
        <div className="panel p-6 text-sm text-amber-800">Für dieses Konto wurde noch kein Mandant eingerichtet.</div>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(380px,.85fr)_minmax(0,1.15fr)]">
          <section className="panel p-5 sm:p-6" aria-labelledby="new-alert">
            <p className="eyebrow">Neue Regel</p>
            <h2 id="new-alert" className="mb-6 mt-2 text-xl font-semibold">Preisalarm anlegen</h2>
            {alertLimit !== null && (
              <p className="mb-5 text-sm text-vault-400">
                Dein Plan nutzt {alerts.filter((alert) => alert.active).length} von {alertLimit} aktiven Preisalarmen.
              </p>
            )}
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
                        <span className={`h-2 w-2 rounded-full ${alert.active ? 'bg-merchant-success' : 'bg-vault-500'}`} />
                        <h3 className="font-semibold">{conditionLabels[alert.condition]}</h3>
                      </div>
                      <p className="mt-2 text-sm text-vault-300">
                        {product?.name ?? 'Alle Produkte'} · {competitor?.shop_name ?? 'Alle Mitbewerber'}
                      </p>
                      <p className="mt-3 font-mono text-xs text-vault-500">
                        {alert.threshold === null ? 'Statusregel' : `Grenzwert ${Number(alert.threshold).toLocaleString('de-DE')} ${suffix}`} · Ruhezeit {alert.cooldown_h} Std.
                      </p>
                    </div>
                    <form action={deleteAlert}>
                      <input type="hidden" name="id" value={alert.id} />
                      <button className="text-xs font-semibold text-red-700 hover:text-red-800">Löschen</button>
                    </form>
                  </div>
                  <details className="mt-4 border-t border-vault-700 pt-4">
                    <summary className="cursor-pointer text-xs font-semibold text-vault-300 hover:text-merchant-success">Regel bearbeiten</summary>
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
      {tenant && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="panel overflow-hidden">
            <div className="border-b border-vault-700 px-5 py-4 font-semibold">Letzte Ereignisse</div>
            <div className="divide-y divide-vault-700/70">
              {events.map((event) => (
                <article key={event.id} className="p-5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>{event.trigger_reason ?? 'Preisalarm'}</span>
                    <span className="font-mono text-xs text-vault-500">{new Date(event.triggered_at).toLocaleString('de-DE')}</span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-vault-400">
                    {event.competitor_price ?? '-'} EUR · {event.delta_pct ?? '-'} %
                  </p>
                </article>
              ))}
              {!events.length && <p className="p-5 text-sm text-vault-400">Noch keine Alert-Ereignisse.</p>}
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-vault-700 px-5 py-4 font-semibold">Kanal-Zustellungen</div>
            <div className="divide-y divide-vault-700/70">
              {deliveries.map((delivery) => (
                <article key={delivery.id} className="p-5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>{delivery.channel_type} · {delivery.status}</span>
                    <span className="font-mono text-xs text-vault-500">{delivery.attempt_count ?? 0} Versuch(e)</span>
                  </div>
                  {delivery.last_error && <p className="mt-2 text-xs text-red-700">{delivery.last_error}</p>}
                </article>
              ))}
              {!deliveries.length && <p className="p-5 text-sm text-vault-400">Noch keine Zustellversuche.</p>}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
