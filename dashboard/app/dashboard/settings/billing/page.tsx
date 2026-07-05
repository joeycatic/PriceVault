import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Gauge,
  Mail,
  MapPin,
  Receipt,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react'

import { backendFetch, currentTenant } from '@/lib/backend'
import { planLimit } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import { CheckoutForm, type CheckoutState } from './CheckoutForm'

async function startCheckout(_state: CheckoutState, formData: FormData): Promise<CheckoutState> {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return { message: 'Dein Mandant konnte nicht geladen werden.', retryable: true }
  if (tenant.membership_role !== 'owner') return { message: 'Nur der Owner darf den Checkout starten.' }
  const plan = String(formData.get('plan'))
  let response: Response
  try {
    response = await backendFetch('/billing/checkout', tenant.id, {
      method: 'POST',
      body: JSON.stringify({
        plan,
        billing_country: tenant.billing_country ?? tenant.headquarters_country ?? 'DE',
        vat_id: tenant.vat_id,
      }),
    })
  } catch {
    return { message: 'Die Checkout-Konfiguration ist derzeit nicht verfügbar.', retryable: true }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: string }
    const detail = payload.detail ?? 'Checkout konnte nicht gestartet werden.'
    const lower = detail.toLocaleLowerCase('de-DE')
    return {
      message: detail,
      field: lower.includes('ust') || lower.includes('vat') ? 'vat_id' : lower.includes('land') ? 'billing_country' : null,
      retryable: response.status >= 500,
    }
  }
  const payload = (await response.json()) as { url?: string }
  if (payload.url) redirect(payload.url)
  return { message: 'Viva hat keine Checkout-Adresse geliefert.', retryable: true }
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
  { id: 'free', number: '01', name: 'Free', note: 'Zum Kennenlernen', price: '0,00 €', gross: '0,00 € brutto', scrapes: '50 Abrufe/Tag', products: '5 Produkte', accent: 'bg-vault-500' },
  { id: 'pro', number: '02', name: 'Pro', note: 'Für wachsende Shops', price: '29,00 € netto', gross: '34,51 € inkl. 19 % USt.', scrapes: '500 Abrufe/Tag', products: '50 Produkte', accent: 'bg-emerald-500' },
  { id: 'agency', number: '03', name: 'Agency', note: 'Für mehrere Sortimente', price: '99,00 € netto', gross: '117,81 € inkl. 19 % USt.', scrapes: '5.000 Abrufe/Tag', products: 'Unbegrenzt', accent: 'bg-amber-400' },
]

const refundStatusLabels: Record<string, string> = { requested: 'angefragt', approved: 'freigegeben', processing: 'in Bearbeitung', succeeded: 'erstattet', rejected: 'abgelehnt', failed: 'fehlgeschlagen' }
const adjustmentLabels: Record<string, string> = { refund: 'Erstattung', credit_note: 'Gutschrift', correction: 'Korrektur' }

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
  const { data: invoices } = tenant
    ? await supabase.from('billing_invoices').select('*').eq('tenant_id', tenant.id).order('issued_at', { ascending: false })
    : { data: [] }
  let adjustments: Array<{ id: string; adjustment_number: string; type: string; amount_cents: number; reason: string; created_at: string }> = []
  let refundRequests: Array<{ id: string; invoice_id: string; amount_cents: number; reason: string; status: string; requested_at: string }> = []
  if (tenant && canManageBilling) {
    try {
      const [adjustmentResponse, refundResponse] = await Promise.all([
        backendFetch('/billing/adjustments', tenant.id),
        backendFetch('/billing/refund-requests', tenant.id),
      ])
      if (adjustmentResponse.ok) adjustments = await adjustmentResponse.json()
      if (refundResponse.ok) refundRequests = await refundResponse.json()
    } catch {
      adjustments = []
      refundRequests = []
    }
  }

  async function requestRefund(formData: FormData) {
    'use server'
    if (!tenant || tenant.membership_role !== 'owner') return
    await backendFetch('/billing/refund-requests', tenant.id, {
      method: 'POST',
      body: JSON.stringify({ invoice_id: String(formData.get('invoice_id')), amount_cents: Math.round(Number(formData.get('amount_eur')) * 100), reason: String(formData.get('reason') ?? '').trim() }),
    })
    revalidatePath('/dashboard/settings/billing')
  }

  async function saveInvoiceDetails(formData: FormData) {
    'use server'
    if (!tenant || tenant.membership_role !== 'owner') return
    const client = await createClient()
    await client.from('tenants').update({
      invoice_email: String(formData.get('invoice_email') ?? '').trim(),
      vat_id: String(formData.get('vat_id') ?? '').trim() || null,
      billing_country: String(formData.get('billing_country') ?? 'DE'),
      billing_address: {
        street: String(formData.get('street') ?? '').trim(),
        postal_code: String(formData.get('postal_code') ?? '').trim(),
        city: String(formData.get('city') ?? '').trim(),
        country: String(formData.get('billing_country') ?? 'DE'),
      },
    }).eq('id', tenant.id).eq('user_id', tenant.user_id)
    revalidatePath('/dashboard/settings/billing')
  }

  const subscriptionLabel = tenant?.subscription_status === 'active'
    ? 'Aktiv'
    : tenant?.subscription_status === 'past_due'
      ? 'Zahlung offen'
      : tenant?.subscription_status === 'canceled'
        ? 'Gekündigt'
        : 'Inaktiv'

  return (
    <>
      <div className="mb-7">
        <header className="relative overflow-hidden rounded-3xl border border-vault-100 bg-vault-100 text-white shadow-[0_24px_65px_rgba(48,48,48,0.18)]">
          <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:40px_40px]" aria-hidden="true" />
          <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                Einstellungen / Abrechnung
              </p>
              <h1 className="mt-5 max-w-2xl text-3xl font-bold tracking-[-0.045em] text-white sm:text-4xl lg:text-5xl">Dein Plan. Deine Reichweite.</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base">Wähle den passenden Takt für deine Preisbeobachtung und behalte Abonnement, Rechnungen und Firmendaten an einem Ort.</p>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-xs text-white/55">
                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />Sicher über Viva</span>
                <span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-emerald-300" aria-hidden="true" />Deutsche Rechnungen</span>
                <span className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-emerald-300" aria-hidden="true" />Transparent verwaltet</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">Aktueller Pass</span>
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />{subscriptionLabel}</span>
              </div>
              <div className="p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-3xl font-bold capitalize tracking-[-0.04em]">{currentPlan}</p>
                    <p className="mt-1 text-xs text-white/45">PriceVault Plan</p>
                  </div>
                  <WalletCards className="h-8 w-8 text-white/25" aria-hidden="true" />
                </div>
                <div className="mt-5 border-t border-dashed border-white/15 pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/45">Tageslimit</span>
                    <strong className="font-mono text-white">{currentLimits.scrapesPerDay.toLocaleString('de-DE')} Abrufe</strong>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-white/45">Rechnungen</span>
                    <strong className="font-mono text-white">{invoices?.length ?? 0}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="relative flex h-1.5" aria-hidden="true"><span className="w-1/2 bg-emerald-400" /><span className="w-1/4 bg-amber-300" /><span className="flex-1 bg-white/15" /></div>
        </header>
      </div>

      <section aria-labelledby="plan-selection">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-vault-500">Tarifauswahl</p>
            <h2 id="plan-selection" className="mt-2 text-2xl font-bold tracking-[-0.03em] text-vault-100">Wie viel Markt möchtest du beobachten?</h2>
          </div>
          <p className="text-xs text-vault-500">Preise pro Abrechnungszeitraum · Checkout über Viva</p>
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.id} className={`group relative flex min-h-[350px] flex-col overflow-hidden rounded-2xl border transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(48,48,48,0.11)] ${currentPlan === plan.id ? 'border-vault-100 bg-vault-100 text-white shadow-[0_18px_45px_rgba(48,48,48,0.16)]' : 'border-vault-700 bg-white text-vault-100'}`}>
            <div className={`h-1.5 ${plan.accent}`} aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-dashed border-current/15 px-5 py-4">
              <span className={`font-mono text-[10px] font-bold tracking-[0.14em] ${currentPlan === plan.id ? 'text-white/45' : 'text-vault-500'}`}>PASS / {plan.number}</span>
              {currentPlan === plan.id ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-950"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Aktiv</span>
              ) : (
                <ArrowUpRight className="h-4 w-4 text-vault-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              )}
            </div>
            <div className="flex flex-1 flex-col p-5">
              <div>
                <p className={`text-xs font-semibold ${currentPlan === plan.id ? 'text-white/45' : 'text-vault-500'}`}>{plan.note}</p>
                <h3 className="mt-2 text-2xl font-bold tracking-[-0.035em]">{plan.name}</h3>
                <p className="mt-5 text-3xl font-bold tracking-[-0.04em]">{plan.price}</p>
                <p className={`mt-1 text-xs ${currentPlan === plan.id ? 'text-white/45' : 'text-vault-500'}`}>{plan.gross}</p>
              </div>
              <div className={`mt-6 space-y-3 border-t border-dashed pt-5 text-sm ${currentPlan === plan.id ? 'border-white/15 text-white/75' : 'border-vault-700 text-vault-300'}`}>
                <p className="flex items-center gap-2"><Check className={`h-4 w-4 ${currentPlan === plan.id ? 'text-emerald-300' : 'text-emerald-600'}`} aria-hidden="true" />{plan.scrapes}</p>
                <p className="flex items-center gap-2"><Check className={`h-4 w-4 ${currentPlan === plan.id ? 'text-emerald-300' : 'text-emerald-600'}`} aria-hidden="true" />{plan.products}</p>
              </div>
              {plan.id !== 'free' && canManageBilling && currentPlan !== plan.id ? (
                <CheckoutForm action={startCheckout} plan={plan.id} label={plan.name} />
              ) : (
                <div className="mt-auto pt-6">
                  <div className={`flex min-h-11 items-center justify-center rounded-lg border border-dashed text-xs font-semibold ${currentPlan === plan.id ? 'border-white/20 text-white/50' : 'border-vault-700 text-vault-500'}`}>
                    {currentPlan === plan.id ? 'Dein aktueller Plan' : plan.id === 'free' ? 'Kostenlos enthalten' : 'Owner-Zugriff erforderlich'}
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
        </div>
      </section>

      {tenant && (
        <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]" aria-labelledby="billing-state">
          <div className="overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-vault-700 bg-vault-950 px-5 py-4">
              <p className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500"><CreditCard className="h-4 w-4" aria-hidden="true" />Abonnementstatus</p>
              <span className={`h-2.5 w-2.5 rounded-full ${tenant.subscription_status === 'active' ? 'bg-emerald-500' : tenant.subscription_status === 'past_due' ? 'bg-amber-500' : 'bg-vault-500'}`} aria-hidden="true" />
            </div>
            <div className="p-5 sm:p-6">
              <h2 id="billing-state" className="text-xl font-bold tracking-[-0.025em]">
                {tenant.subscription_status === 'active' ? 'Aktives Abonnement' : tenant.subscription_status === 'past_due' ? 'Zahlung überfällig' : tenant.subscription_status === 'canceled' ? 'Gekündigt' : 'Kein aktives Abonnement'}
              </h2>
              <p className="mt-2 text-sm text-vault-300">
                Plan {tenant.subscription_plan ?? tenant.plan} · Verlängerung {tenant.subscription_current_period_end ? formatRelativeTime(tenant.subscription_current_period_end) : 'nicht geplant'}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-vault-800 bg-vault-950 p-3"><Gauge className="h-4 w-4 text-vault-500" aria-hidden="true" /><p className="mt-3 font-mono text-sm font-bold">{currentLimits.scrapesPerDay.toLocaleString('de-DE')}</p><p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-vault-500">Abrufe / Tag</p></div>
                <div className="rounded-xl border border-vault-800 bg-vault-950 p-3"><CalendarClock className="h-4 w-4 text-vault-500" aria-hidden="true" /><p className="mt-3 font-mono text-sm font-bold">{tenant.subscription_current_period_end ? formatRelativeTime(tenant.subscription_current_period_end) : '—'}</p><p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-vault-500">Nächster Termin</p></div>
                <div className="rounded-xl border border-vault-800 bg-vault-950 p-3"><Receipt className="h-4 w-4 text-vault-500" aria-hidden="true" /><p className="mt-3 font-mono text-sm font-bold">{invoices?.length ?? 0}</p><p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-vault-500">Rechnungen</p></div>
              </div>
              {tenant.subscription_cancel_at_period_end && (
                <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Dein Abonnement endet zum Periodenende {tenant.cancellation_effective_at ? formatRelativeTime(tenant.cancellation_effective_at) : ''}. Danach wird der Free-Plan aktiv.
                </p>
              )}
              {tenant.last_payment_error && (
                <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Letzter Zahlungsfehler: {tenant.last_payment_error}
                  {tenant.next_payment_retry_at ? ` · nächster Versuch ${formatRelativeTime(tenant.next_payment_retry_at)}` : ''}
                </p>
              )}
            </div>
          </div>

          <aside className="flex flex-col rounded-2xl border border-vault-700 bg-vault-100 p-5 text-white shadow-panel sm:p-6">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-white/45">Abo-Kontrolle</p>
            <WalletCards className="mt-5 h-8 w-8 text-emerald-300" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold">Alles unter Kontrolle.</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">Zahlungsversuche, Kündigung und Planwechsel bleiben direkt mit deinem Workspace verknüpft.</p>
            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs"><span className="text-white/45">Fehlversuche</span><strong className="font-mono">{tenant.failed_payment_count ?? 0} / 3</strong></div>
            {canManageBilling && tenant.billing_provider === 'viva' && tenant.subscription_status === 'active' && !tenant.subscription_cancel_at_period_end ? (
              <form action={cancelSubscription} className="mt-auto pt-6">
                <button className="min-h-11 w-full rounded-lg border border-white/15 px-4 text-sm font-semibold text-white/75 transition hover:border-white/30 hover:bg-white/10 hover:text-white">Abonnement kündigen</button>
              </form>
            ) : null}
          </aside>
        </section>
      )}

      {!canManageBilling ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Nur Owner dürfen Plan und Abrechnung verwalten.
        </div>
      ) : null}

      {canManageBilling && tenant && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel" aria-labelledby="invoice-details">
          <div className="grid border-b border-vault-700 bg-vault-950 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="px-5 py-4 sm:px-6">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500">Rechnungsprofil</p>
              <h2 id="invoice-details" className="mt-2 text-lg font-bold">Empfänger und Anschrift</h2>
            </div>
            <div className="hidden h-full items-center gap-3 border-l border-vault-700 px-6 text-xs text-vault-500 sm:flex"><MapPin className="h-4 w-4" aria-hidden="true" />EU-Unternehmen</div>
          </div>
          <div className="p-5 sm:p-6">
            <form action={saveInvoiceDetails} className="grid gap-4 sm:grid-cols-2">
              <label><span className="field-label flex items-center gap-2"><Mail className="h-3.5 w-3.5" aria-hidden="true" />Rechnungs-E-Mail</span><input className="field" name="invoice_email" type="email" required defaultValue={tenant.invoice_email ?? ''} /></label>
              <label><span className="field-label">USt-IdNr.</span><input className="field" name="vat_id" defaultValue={tenant.vat_id ?? ''} /><span className="mt-1 block text-xs text-vault-500">Für Unternehmen außerhalb Deutschlands erforderlich und vor dem Checkout über VIES geprüft.</span></label>
              <label><span className="field-label">Rechnungsland</span><select className="field" name="billing_country" defaultValue={tenant.billing_country ?? tenant.headquarters_country ?? 'DE'}>{['AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'].map((country) => <option key={country} value={country}>{country}</option>)}</select></label>
              <label className="sm:col-span-2"><span className="field-label">Straße und Hausnummer</span><input className="field" name="street" required defaultValue={tenant.billing_address?.street ?? ''} /></label>
              <label><span className="field-label">Postleitzahl</span><input className="field" name="postal_code" required defaultValue={tenant.billing_address?.postal_code ?? ''} /></label>
              <label><span className="field-label">Ort</span><input className="field" name="city" required defaultValue={tenant.billing_address?.city ?? ''} /></label>
              <p className="rounded-lg bg-vault-950 px-3 py-2 text-xs leading-5 text-vault-500 sm:col-span-2">Deutschland: 19 % USt. Andere EU-Länder: Reverse Charge nur mit gültiger, von VIES bestätigter USt-IdNr. Bei einer VIES-Störung bleibt der Checkout gesperrt.</p>
              <div className="flex justify-end border-t border-vault-800 pt-4 sm:col-span-2"><button className="button-primary min-w-52">Rechnungsdaten speichern</button></div>
            </form>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <section className="overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel" aria-labelledby="order-history">
          <div className="flex items-center justify-between border-b border-vault-700 px-5 py-4">
            <div><p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500">Viva</p><h2 id="order-history" className="mt-2 flex items-center gap-2 font-bold"><Receipt className="h-4 w-4 text-vault-500" aria-hidden="true" />Bestellungen</h2></div>
            <span className="font-mono text-xs text-vault-500">{orders?.length ?? 0}</span>
          </div>
          <div className="divide-y divide-vault-800">
            {(orders ?? []).map((order) => (
              <article key={order.id} className="flex flex-col gap-3 p-5 text-sm transition hover:bg-vault-950 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold capitalize">{order.plan} · {(order.amount_cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p><p className="mt-1 font-mono text-[10px] text-vault-500">ORDER / {order.order_code}</p></div>
                <div className="sm:text-right"><p className="flex items-center gap-2 text-xs font-semibold sm:justify-end"><span className={`h-2 w-2 rounded-full ${order.status === 'paid' || order.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />{order.status}</p><p className="mt-1 text-xs text-vault-500">{formatRelativeTime(order.created_at)}</p></div>
              </article>
            ))}
            {!(orders ?? []).length && <p className="p-6 text-sm text-vault-400">Noch keine Viva-Bestellungen gespeichert.</p>}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel" aria-labelledby="invoice-history">
          <div className="flex items-center justify-between border-b border-vault-700 px-5 py-4">
            <div><p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500">Dokumente</p><h2 id="invoice-history" className="mt-2 flex items-center gap-2 font-bold"><FileText className="h-4 w-4 text-vault-500" aria-hidden="true" />Rechnungen</h2></div>
            <span className="font-mono text-xs text-vault-500">{invoices?.length ?? 0}</span>
          </div>
          <div className="divide-y divide-vault-800">
            {(invoices ?? []).map((invoice) => (
              <article key={invoice.id} className="flex flex-col gap-3 p-5 text-sm transition hover:bg-vault-950 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold">{invoice.invoice_number} · {{ issued: 'ausgestellt', corrected: 'korrigiert', credited: 'gutgeschrieben', refunded: 'erstattet' }[invoice.invoice_state as 'issued' | 'corrected' | 'credited' | 'refunded'] ?? invoice.invoice_state}</p><p className="mt-1 text-xs text-vault-500">{(invoice.net_amount_cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} netto · {(invoice.vat_amount_cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} USt. · {(invoice.gross_amount_cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} brutto</p></div>
                <a className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-vault-700 bg-white px-3 text-xs font-bold transition hover:border-vault-500 hover:bg-vault-950" href={`/api/billing/invoices/${invoice.id}`}><Download className="h-4 w-4" aria-hidden="true" />PDF</a>
              </article>
            ))}
            {!(invoices ?? []).length && <p className="p-6 text-sm text-vault-400">Noch keine Rechnungen vorhanden.</p>}
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel" aria-labelledby="refund-history">
          <div className="border-b border-vault-700 px-5 py-4"><p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500">Erstattungen</p><h2 id="refund-history" className="mt-2 font-bold">Anfragen und Gutschriften</h2></div>
          {canManageBilling && (invoices ?? []).length > 0 && (
            <form action={requestRefund} className="grid gap-3 border-b border-vault-700 p-5">
              <label><span className="field-label">Rechnung</span><select className="field" name="invoice_id" required>{(invoices ?? []).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number}</option>)}</select></label>
              <label><span className="field-label">Betrag in EUR</span><input className="field" name="amount_eur" type="number" min="0.01" step="0.01" required /></label>
              <label><span className="field-label">Grund</span><textarea className="field min-h-20" name="reason" minLength={3} required /></label>
              <button className="button-secondary">Erstattung anfragen</button>
            </form>
          )}
          <div className="divide-y divide-vault-700">
            {refundRequests.map((request) => <article key={request.id} className="p-5 text-sm"><div className="flex justify-between gap-3"><span>{(request.amount_cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} · {request.reason}</span><strong className="text-xs">{refundStatusLabels[request.status] ?? request.status}</strong></div></article>)}
            {adjustments.map((adjustment) => <article key={adjustment.id} className="flex items-center justify-between gap-3 p-5 text-sm"><div><p className="font-semibold">{adjustment.adjustment_number}</p><p className="mt-1 text-xs text-vault-500">{adjustmentLabels[adjustment.type] ?? adjustment.type} · {(adjustment.amount_cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p></div><a className="font-semibold underline" href={`/api/billing/adjustments/${adjustment.id}`}>PDF</a></article>)}
            {!refundRequests.length && !adjustments.length && <p className="p-5 text-sm text-vault-400">Keine Erstattungen oder Korrekturen.</p>}
          </div>
        </section>
      </div>
    </>
  )
}
