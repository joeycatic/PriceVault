import { redirect } from 'next/navigation'

import { backendFetch, currentTenant } from '@/lib/backend'
import { planLimit } from '@/lib/plan-gates'

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
  const currentPlan = tenant?.plan ?? 'free'
  const currentLimits = planLimit(currentPlan)
  const canManageBilling = tenant?.membership_role === 'owner'

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Abrechnung</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Plan verwalten</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
          Wechsle über Viva Smart Checkout auf Pro oder Agency und verwalte dein Abonnement.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <section key={plan.id} className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{plan.name}</p>
                <h2 className="mt-3 text-3xl font-bold">{plan.price}</h2>
              </div>
              {currentPlan === plan.id && <span className="border border-vault-lime/50 px-2 py-1 text-xs text-vault-lime">Aktiv</span>}
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

      {canManageBilling && tenant?.billing_provider === 'viva' && tenant.subscription_status === 'active' ? (
        <form action={cancelSubscription} className="mt-6">
          <button className="button-secondary">Abonnement kündigen</button>
        </form>
      ) : !canManageBilling ? (
        <div className="panel mt-6 border-l-2 border-l-vault-lime p-5 text-sm text-vault-300">
          Nur Owner dürfen Plan und Abrechnung verwalten.
        </div>
      ) : null}
      <p className="mt-4 text-sm text-vault-300">
        Aktuelles Tageslimit: {currentLimits.scrapesPerDay.toLocaleString('de-DE')} Preisabrufe.
      </p>
    </>
  )
}
