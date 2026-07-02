import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/ui/MerchantUI'
import { backendFetch, currentTenant } from '@/lib/backend'
import { planLimit } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'

async function startCheckout(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  if (tenant.membership_role !== 'owner') return
  const plan = String(formData.get('plan'))
  const response = await backendFetch('/billing/checkout', tenant.id, {
    method: 'POST',
    body: JSON.stringify({ plan }),
  })
  if (!response.ok) return
  const payload = (await response.json()) as { url?: string }
  if (payload.url) redirect(payload.url)
}

async function cancelSubscription() {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  if (tenant.membership_role !== 'owner') return
  await backendFetch('/billing/cancel', tenant.id, { method: 'POST' })
  redirect('/dashboard/settings/billing?canceled=1')
}

const plans = [
  { id: 'free', name: 'Free', price: '0 EUR', scrapes: '50 Abrufe/Tag', products: '5 Produkte' },
  { id: 'pro', name: 'Pro', price: '29 EUR', scrapes: '500 Abrufe/Tag', products: '50 Produkte' },
  { id: 'agency', name: 'Agency', price: '99 EUR', scrapes: '5.000 Abrufe/Tag', products: 'Unbegrenzt' },
]

export default async function BillingPage() {
  const tenant = await currentTenant()
  const supabase = await createClient()
  const currentPlan = tenant?.plan ?? 'free'
  const currentLimits = planLimit(currentPlan)
  const canManageBilling = tenant?.membership_role === 'owner'
  const { data: orders } = tenant
    ? await supabase
      .from('billing_orders')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(12)
    : { data: [] }

  return (
    <>
      <PageHeader
        eyebrow="Abrechnung"
        title="Plan verwalten"
        description="Wechsle über Viva Smart Checkout auf Pro oder Agency und verwalte dein Abonnement."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <section key={plan.id} className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{plan.name}</p>
                <h2 className="mt-3 text-3xl font-bold">{plan.price}</h2>
              </div>
              {currentPlan === plan.id && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-merchant-success">Aktiv</span>}
            </div>
            <div className="mt-6 space-y-2 text-sm text-vault-300">
              <p>{plan.scrapes}</p>
              <p>{plan.products}</p>
            </div>
            {plan.id !== 'free' && canManageBilling && (
              <form action={startCheckout} className="mt-6">
                <input type="hidden" name="plan" value={plan.id} />
                <button className="button-primary w-full">Plan auswählen</button>
              </form>
            )}
          </section>
        ))}
      </div>

      {tenant && (
        <section className="panel mt-6 p-5" aria-labelledby="billing-state">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="eyebrow">Aktueller Status</p>
              <h2 id="billing-state" className="mt-2 text-xl font-semibold">
                {tenant.subscription_status === 'active' ? 'Aktives Abonnement' : tenant.subscription_status === 'past_due' ? 'Zahlung überfällig' : tenant.subscription_status === 'canceled' ? 'Gekündigt' : 'Kein aktives Abonnement'}
              </h2>
              <p className="mt-2 text-sm text-vault-300">
                Plan {tenant.subscription_plan ?? tenant.plan} · Verlängerung {tenant.subscription_current_period_end ? formatRelativeTime(tenant.subscription_current_period_end) : 'nicht geplant'}
              </p>
              {tenant.subscription_cancel_at_period_end && (
                <p className="mt-3 text-sm text-amber-700">
                  Dein Abonnement endet zum Periodenende {tenant.cancellation_effective_at ? formatRelativeTime(tenant.cancellation_effective_at) : ''}. Danach wird der Free-Plan aktiv.
                </p>
              )}
              {tenant.last_payment_error && (
                <p className="mt-3 text-sm text-red-700">
                  Letzter Zahlungsfehler: {tenant.last_payment_error}
                  {tenant.next_payment_retry_at ? ` · nächster Versuch ${formatRelativeTime(tenant.next_payment_retry_at)}` : ''}
                </p>
              )}
            </div>
            <p className="rounded-lg border border-vault-800 px-3 py-2 text-sm text-vault-300">
              Fehlversuche: {tenant.failed_payment_count ?? 0} / 3
            </p>
          </div>
        </section>
      )}

      {canManageBilling && tenant?.billing_provider === 'viva' && tenant.subscription_status === 'active' && !tenant.subscription_cancel_at_period_end ? (
        <form action={cancelSubscription} className="mt-6">
          <button className="button-secondary">Abonnement kündigen</button>
        </form>
      ) : !canManageBilling ? (
        <div className="panel mt-6 border-l-2 border-l-merchant-success p-5 text-sm text-vault-300">
          Nur Owner dürfen Plan und Abrechnung verwalten.
        </div>
      ) : null}
      <p className="mt-4 text-sm text-vault-300">
        Aktuelles Tageslimit: {currentLimits.scrapesPerDay.toLocaleString('de-DE')} Preisabrufe.
      </p>

      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-vault-700 px-5 py-4 font-semibold">Abrechnungshistorie</div>
        <div className="divide-y divide-vault-700/70">
          {(orders ?? []).map((order) => (
            <article key={order.id} className="flex flex-col gap-2 p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{order.plan} · {(order.amount_cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
                <p className="mt-1 font-mono text-xs text-vault-500">Order {order.order_code}</p>
              </div>
              <div className="text-left sm:text-right">
                <p>{order.status}</p>
                <p className="mt-1 text-xs text-vault-500">{formatRelativeTime(order.created_at)}</p>
              </div>
            </article>
          ))}
          {!(orders ?? []).length && <p className="p-5 text-sm text-vault-400">Noch keine Viva-Bestellungen gespeichert.</p>}
        </div>
      </section>
    </>
  )
}
