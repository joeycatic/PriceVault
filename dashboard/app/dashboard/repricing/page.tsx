import { revalidatePath } from 'next/cache'
import { BadgeEuro, ShieldCheck, Target, WandSparkles } from 'lucide-react'

import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { MutationButton } from '@/components/ui/MutationButton'
import { backendFetch, currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import type { Competitor, Product, ProductVariant } from '@/lib/types'
import { formatPrice } from '@/lib/utils'

type Rule = {
  id: string
  name: string
  strategy: 'match_lowest' | 'beat_percent' | 'stay_above_percent'
  beat_by_pct: number
  competitor_ids: string[] | null
  min_margin_pct: number
  approval_mode: 'manual' | 'automatic'
  max_change_pct: number
  require_healthy_sources: boolean
  active: boolean
}

type Suggestion = {
  id: string
  status: 'pending' | 'failed'
  previous_price: number | null
  lowest_competitor_price: number
  margin_floor: number
  suggested_price: number
  writeback_status: string
  writeback_error: string | null
  products: { name: string } | null
  product_variants: { name: string; sku: string | null; cost_price: number; currency: string } | null
  repricing_rules: { name: string; strategy: string; beat_by_pct: number; min_margin_pct: number } | null
}

type RepricingChange = {
  id: string
  actor_type: 'automatic' | 'user' | 'operator'
  pre_change_value: number | null
  requested_value: number
  status: string
  rollback_state: string
  error: string | null
  created_at: string
  product_variants: { name: string; sku: string | null; currency: string } | null
}

export default async function RepricingPage() {
  const tenant = await currentTenant()
  const supabase = await createClient()
  const [{ data: productData }, { data: variantData }, { data: competitorData }] = tenant
    ? await Promise.all([
        supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('active', true).order('name'),
        supabase.from('product_variants').select('*').eq('tenant_id', tenant.id).eq('active', true).order('name'),
        supabase.from('competitors').select('*').eq('tenant_id', tenant.id).eq('active', true).order('shop_name'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]
  const products = (productData ?? []) as Product[]
  const variants = (variantData ?? []) as ProductVariant[]
  const competitors = (competitorData ?? []) as Competitor[]
  let rules: Rule[] = []
  let suggestions: Suggestion[] = []
  let changes: RepricingChange[] = []
  if (tenant) {
    try {
      const [ruleResponse, suggestionResponse, failedSuggestionResponse, changeResponse] = await Promise.all([
        backendFetch('/repricing/rules', tenant.id),
        backendFetch('/repricing/suggestions', tenant.id),
        backendFetch('/repricing/suggestions?status=failed', tenant.id),
        backendFetch('/repricing/changes', tenant.id),
      ])
      if (ruleResponse.ok) rules = await ruleResponse.json()
      if (suggestionResponse.ok) suggestions = await suggestionResponse.json()
      if (failedSuggestionResponse.ok) suggestions.push(...await failedSuggestionResponse.json())
      if (changeResponse.ok) changes = await changeResponse.json()
    } catch {
      rules = []
      suggestions = []
      changes = []
    }
  }

  async function createRule(formData: FormData) {
    'use server'
    if (!tenant) return
    await backendFetch('/repricing/rules', tenant.id, {
      method: 'POST',
      body: JSON.stringify({
        name: String(formData.get('name') ?? '').trim(),
        strategy: String(formData.get('strategy')),
        beat_by_pct: Number(formData.get('beat_by_pct') ?? 0),
        min_margin_pct: Number(formData.get('min_margin_pct') ?? 0),
        approval_mode: String(formData.get('approval_mode') ?? 'manual'),
        max_change_pct: Number(formData.get('max_change_pct') ?? 10),
        require_healthy_sources: formData.get('require_healthy_sources') === 'on',
        variant_id: String(formData.get('variant_id') || '') || null,
        competitor_ids: formData.getAll('competitor_ids').map(String),
      }),
    })
    revalidatePath('/dashboard/repricing')
  }

  async function generate() {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const response = await backendFetch('/repricing/suggestions/generate', tenant.id, { method: 'POST' })
    if (!response.ok) return { ok: false, message: 'Preisvorschläge konnten nicht berechnet werden.' }
    const result = await response.json()
    revalidatePath('/dashboard/repricing')
    return { ok: true, message: `${result.suggestions} Vorschläge berechnet.` }
  }

  async function review(formData: FormData, decision: 'approve' | 'reject') {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const response = await backendFetch(`/repricing/suggestions/${String(formData.get('id'))}/${decision}`, tenant.id, { method: 'POST' })
    const payload = await response.json()
    if (!response.ok) return { ok: false, message: payload.detail ?? 'Preisvorschlag konnte nicht bearbeitet werden.' }
    revalidatePath('/dashboard/repricing')
    revalidatePath('/dashboard/products')
    return { ok: true, message: decision === 'approve' ? 'Preis wurde angewendet.' : 'Vorschlag wurde abgelehnt.' }
  }

  async function approve(formData: FormData) {
    'use server'
    return review(formData, 'approve')
  }

  async function reject(formData: FormData) {
    'use server'
    return review(formData, 'reject')
  }

  async function deactivate(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const response = await backendFetch(`/repricing/rules/${String(formData.get('id'))}`, tenant.id, {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    })
    revalidatePath('/dashboard/repricing')
    return response.ok ? { ok: true, message: 'Regel deaktiviert.' } : { ok: false, message: 'Regel konnte nicht deaktiviert werden.' }
  }

  async function rollback(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const response = await backendFetch(`/repricing/changes/${String(formData.get('id'))}/rollback`, tenant.id, { method: 'POST' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return { ok: false, message: payload.detail ?? 'Rollback konnte nicht ausgeführt werden.' }
    revalidatePath('/dashboard/repricing')
    revalidatePath('/dashboard/products')
    return { ok: true, message: 'Preisänderung wurde zurückgesetzt.' }
  }

  return (
    <>
      <PageHeader
        eyebrow="Preissteuerung"
        title="Preisvorschläge"
        description="Preisvorschläge automatisch berechnen, sicher prüfen und auf Wunsch direkt im verbundenen Shop anwenden."
        actions={<MutationButton id="all" label="Neu berechnen" pendingLabel="Wird berechnet …" action={generate} tone="neutral" />}
      />
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        Automatische Preisänderungen sind produktionsweit deaktiviert. Regeln können Vorschläge erzeugen; manuelle Freigaben bleiben verfügbar. Eine spätere Aktivierung erfordert eine separate Sicherheitsfreigabe.
      </div>
      <div className="mb-6">
        <MetricGrid items={[
          { label: 'Aktive Regeln', value: rules.filter((rule) => rule.active).length, tone: rules.some((rule) => rule.active) ? 'success' : 'neutral' },
          { label: 'Offene Vorschläge', value: suggestions.filter((suggestion) => suggestion.status === 'pending').length, tone: suggestions.length ? 'warning' : 'neutral' },
          { label: 'Fehlgeschlagen', value: suggestions.filter((suggestion) => suggestion.status === 'failed').length, tone: suggestions.some((suggestion) => suggestion.status === 'failed') ? 'danger' : 'success' },
          { label: 'Varianten', value: variants.length },
        ]} />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="panel overflow-hidden" aria-labelledby="new-rule">
            <div className="border-b border-vault-700 bg-vault-100 p-5 text-white">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                <Target className="h-4 w-4" aria-hidden="true" />
                Neue Regel
              </p>
              <h2 id="new-rule" className="mt-2 text-xl font-bold">Preisstrategie festlegen</h2>
              <p className="mt-2 text-sm leading-6 text-white/65">Definiere Sicherheitsgrenzen, bevor Vorschläge erzeugt werden.</p>
            </div>
            <div className="p-5">
            <form action={createRule} className="mt-5 space-y-4">
              <label><span className="field-label">Name</span><input className="field" name="name" required placeholder="Marktpreis mit 25 % Marge" /></label>
              <label>
                <span className="field-label">Geltungsbereich</span>
                <select className="field" name="variant_id" defaultValue="">
                  <option value="">Alle Varianten</option>
                  {variants.map((variant) => {
                    const product = products.find((item) => item.id === variant.product_id)
                    return <option key={variant.id} value={variant.id}>{product?.name} · {variant.name}</option>
                  })}
                </select>
              </label>
              <label>
                <span className="field-label">Strategie</span>
                <select className="field" name="strategy" defaultValue="match_lowest">
                  <option value="match_lowest">Niedrigsten Mitbewerberpreis übernehmen</option>
                  <option value="beat_percent">Niedrigsten Preis prozentual unterbieten</option>
                  <option value="stay_above_percent">Über dem günstigsten Preis bleiben (+X %)</option>
                </select>
              </label>
              <fieldset className="rounded-lg border border-vault-700 bg-vault-950/70 p-4">
                <legend className="field-label">Nur diese Mitbewerber berücksichtigen</legend>
                <p className="mb-3 text-xs leading-5 text-vault-500">Leer lassen, um alle Mitbewerber einzubeziehen.</p>
                <div className="grid gap-2">
                  {competitors.map((competitor) => (
                    <label key={competitor.id} className="flex items-center gap-3 text-sm text-vault-300">
                      <input type="checkbox" name="competitor_ids" value={competitor.id} className="h-4 w-4" />
                      {competitor.shop_name}
                    </label>
                  ))}
                  {!competitors.length && <p className="text-xs text-vault-500">Noch keine aktiven Mitbewerber angelegt.</p>}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-4">
                <label><span className="field-label">Abstand über / unter günstigstem Preis (%)</span><input className="field" name="beat_by_pct" type="number" min="0" max="50" step="0.1" defaultValue="1" /></label>
                <label><span className="field-label">Mindestmarge %</span><input className="field" name="min_margin_pct" type="number" min="0" max="500" step="0.1" required defaultValue="25" /></label>
              </div>
              <label>
                <span className="field-label">Anwendung</span>
                <select className="field" name="approval_mode" defaultValue="manual">
                  <option value="manual">Manuell freigeben</option>
                  <option value="automatic" disabled={tenant?.plan !== 'agency'}>Automatisch anwenden · Agency</option>
                </select>
              </label>
              <div className="rounded-lg border border-vault-700 bg-vault-800 p-4">
                <p className="text-xs font-semibold text-vault-300">Sicherheitsgrenzen für automatische Änderungen</p>
                <label className="mt-3 block">
                  <span className="field-label">Maximale Preisänderung %</span>
                  <input className="field" name="max_change_pct" type="number" min="0.1" max="100" step="0.1" required defaultValue="10" />
                </label>
                <label className="mt-3 flex items-start gap-3 text-xs text-vault-300">
                  <input className="mt-0.5 h-4 w-4" type="checkbox" name="require_healthy_sources" defaultChecked />
                  Nur anwenden, wenn alle Preisquellen der Variante gesund sind
                </label>
              </div>
              <button className="button-primary gap-2"><WandSparkles className="h-4 w-4" aria-hidden="true" />Regel anlegen</button>
            </form>
            </div>
          </section>
          <section className="panel overflow-hidden">
            <div className="border-b border-vault-700 bg-white px-5 py-4">
              <p className="eyebrow">Regelwerk</p>
              <h2 className="mt-2 font-semibold">Aktive Regeln</h2>
            </div>
            <div className="divide-y divide-vault-700/70">
              {rules.filter((rule) => rule.active).map((rule) => (
                <article key={rule.id} className="p-5 text-sm">
                  <div className="flex justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{rule.name}</p>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${rule.approval_mode === 'automatic' ? 'bg-emerald-50 text-merchant-success' : 'bg-vault-800 text-vault-500'}`}>
                          {rule.approval_mode === 'automatic' ? 'Auto-Anwendung' : 'Manuelle Freigabe'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-vault-500">
                        {rule.strategy === 'match_lowest'
                          ? 'Niedrigsten Preis übernehmen'
                          : rule.strategy === 'stay_above_percent'
                            ? `${rule.beat_by_pct} % über dem günstigsten Preis bleiben`
                            : `${rule.beat_by_pct} % unterbieten`} · mindestens {rule.min_margin_pct} % Marge
                      </p>
                      {rule.competitor_ids?.length ? <p className="mt-2 text-xs text-vault-500">{rule.competitor_ids.length} Mitbewerber im Regel-Scope</p> : null}
                      {rule.approval_mode === 'automatic' && <p className="mt-2 text-xs text-vault-500">Maximal {rule.max_change_pct} % Änderung{rule.require_healthy_sources ? ' · nur gesunde Quellen' : ''}</p>}
                    </div>
                    <MutationButton id={rule.id} label="Deaktivieren" pendingLabel="Wird deaktiviert …" action={deactivate} />
                  </div>
                </article>
              ))}
              {!rules.some((rule) => rule.active) && <p className="p-5 text-sm text-vault-400">Noch keine aktive Preisregel.</p>}
            </div>
          </section>
        </div>
        <section className="panel overflow-hidden" aria-labelledby="approval-queue">
          <div className="border-b border-vault-700 bg-white px-5 py-4">
            <p className="eyebrow">Review Queue</p>
            <h2 id="approval-queue" className="mt-2 text-xl font-semibold">Prüf- und Freigabewarteschlange</h2>
          </div>
          <div className="divide-y divide-vault-700/70">
            {suggestions.map((suggestion) => (
              <article key={suggestion.id} className="p-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold"><BadgeEuro className="h-4 w-4 text-merchant-success" aria-hidden="true" />{suggestion.products?.name} · {suggestion.product_variants?.name}</h3>
                    <p className="mt-1 text-xs text-vault-500">{suggestion.repricing_rules?.name}</p>
                    {suggestion.writeback_error && (
                      <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${suggestion.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                        {suggestion.status === 'failed' ? 'Anwendung fehlgeschlagen' : 'Automatik angehalten'}: {suggestion.writeback_error}
                      </p>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                      <div><p className="text-xs text-vault-500">Aktuell</p><p className="mt-1 font-mono">{formatPrice(suggestion.previous_price, suggestion.product_variants?.currency)}</p></div>
                      <div><p className="text-xs text-vault-500">Marktminimum</p><p className="mt-1 font-mono">{formatPrice(suggestion.lowest_competitor_price, suggestion.product_variants?.currency)}</p></div>
                      <div><p className="text-xs text-vault-500">Preisuntergrenze</p><p className="mt-1 font-mono">{formatPrice(suggestion.margin_floor, suggestion.product_variants?.currency)}</p></div>
                      <div><p className="text-xs text-vault-500">Vorschlag</p><p className="mt-1 font-mono font-semibold text-merchant-success">{formatPrice(suggestion.suggested_price, suggestion.product_variants?.currency)}</p></div>
                    </div>
                  </div>
                  {suggestion.status === 'pending' ? (
                    <div className="flex gap-4 lg:justify-end">
                      <MutationButton id={suggestion.id} label="Freigeben & anwenden" pendingLabel="Wird angewendet …" action={approve} tone="neutral" />
                      <MutationButton id={suggestion.id} label="Ablehnen" pendingLabel="Wird abgelehnt …" action={reject} />
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Fehlgeschlagen</span>
                  )}
                </div>
              </article>
            ))}
            {!suggestions.length && <p className="p-6 text-sm text-vault-400">Keine offenen Preisvorschläge.</p>}
          </div>
        </section>
      </div>
      <section className="panel mt-6 overflow-hidden" aria-labelledby="change-history">
        <div className="border-b border-vault-700 bg-white px-5 py-4"><p className="eyebrow">Änderungsprotokoll</p><h2 id="change-history" className="mt-2 text-xl font-semibold">Anwendungen und Rollbacks</h2><p className="mt-2 text-xs text-vault-500">Ein Rollback schreibt zuerst in den verbundenen Shop. Bei einem Connector-Fehler bleibt der lokale Preis unverändert.</p></div>
        <div className="divide-y divide-vault-700">
          {changes.map((change) => <article key={change.id} className="flex flex-col gap-3 p-5 text-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{change.product_variants?.name ?? 'Variante'} · {formatPrice(change.requested_value, change.product_variants?.currency)}</p><p className="mt-1 text-xs text-vault-500">Vorher {formatPrice(change.pre_change_value, change.product_variants?.currency)} · {change.actor_type === 'automatic' ? 'automatisch' : 'manuell'} · {change.rollback_state}</p>{change.error && <p className="mt-2 text-xs text-red-700">{change.error}</p>}</div>{change.actor_type !== 'automatic' && change.status === 'succeeded' && change.rollback_state === 'available' && change.pre_change_value !== null ? <MutationButton id={change.id} label="Rollback bestätigen" pendingLabel="Rollback läuft …" action={rollback} tone="danger" /> : <span className="text-xs text-vault-500">Kein Kunden-Rollback verfügbar</span>}</article>)}
          {!changes.length && <p className="p-5 text-sm text-vault-400">Noch keine Preisänderungen protokolliert.</p>}
        </div>
      </section>
    </>
  )
}
