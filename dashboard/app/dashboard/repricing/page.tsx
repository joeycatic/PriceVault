import { revalidatePath } from 'next/cache'

import { PageHeader } from '@/components/ui/MerchantUI'
import { MutationButton } from '@/components/ui/MutationButton'
import { backendFetch, currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import type { Product, ProductVariant } from '@/lib/types'
import { formatPrice } from '@/lib/utils'

type Rule = {
  id: string
  name: string
  strategy: 'match_lowest' | 'beat_percent'
  beat_by_pct: number
  min_margin_pct: number
  active: boolean
}

type Suggestion = {
  id: string
  previous_price: number | null
  lowest_competitor_price: number
  margin_floor: number
  suggested_price: number
  writeback_status: string
  products: { name: string } | null
  product_variants: { name: string; sku: string | null; cost_price: number; currency: string } | null
  repricing_rules: { name: string; strategy: string; beat_by_pct: number; min_margin_pct: number } | null
}

export default async function RepricingPage() {
  const tenant = await currentTenant()
  const supabase = await createClient()
  const [{ data: productData }, { data: variantData }] = tenant
    ? await Promise.all([
        supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('active', true).order('name'),
        supabase.from('product_variants').select('*').eq('tenant_id', tenant.id).eq('active', true).order('name'),
      ])
    : [{ data: [] }, { data: [] }]
  const products = (productData ?? []) as Product[]
  const variants = (variantData ?? []) as ProductVariant[]
  let rules: Rule[] = []
  let suggestions: Suggestion[] = []
  if (tenant) {
    try {
      const [ruleResponse, suggestionResponse] = await Promise.all([
        backendFetch('/repricing/rules', tenant.id),
        backendFetch('/repricing/suggestions', tenant.id),
      ])
      if (ruleResponse.ok) rules = await ruleResponse.json()
      if (suggestionResponse.ok) suggestions = await suggestionResponse.json()
    } catch {
      rules = []
      suggestions = []
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
        variant_id: String(formData.get('variant_id') || '') || null,
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

  return (
    <>
      <PageHeader
        eyebrow="Preissteuerung"
        title="Preisvorschläge"
        description="Regelbasiert rechnen, Marge schützen und jede Preisänderung vor der Anwendung prüfen."
        actions={<MutationButton id="all" label="Neu berechnen" pendingLabel="Wird berechnet …" action={generate} tone="neutral" />}
      />
      <div className="grid items-start gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="panel p-5" aria-labelledby="new-rule">
            <p className="eyebrow">Neue Regel</p>
            <h2 id="new-rule" className="mt-2 font-semibold">Preisstrategie festlegen</h2>
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
                </select>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label><span className="field-label">Unterbieten um %</span><input className="field" name="beat_by_pct" type="number" min="0" max="50" step="0.1" defaultValue="1" /></label>
                <label><span className="field-label">Mindestmarge %</span><input className="field" name="min_margin_pct" type="number" min="0" max="500" step="0.1" required defaultValue="25" /></label>
              </div>
              <button className="button-primary">Regel anlegen</button>
            </form>
          </section>
          <section className="panel overflow-hidden">
            <div className="border-b border-vault-700 px-5 py-4 font-semibold">Aktive Regeln</div>
            <div className="divide-y divide-vault-700/70">
              {rules.filter((rule) => rule.active).map((rule) => (
                <article key={rule.id} className="p-5 text-sm">
                  <div className="flex justify-between gap-4">
                    <div><p className="font-semibold">{rule.name}</p><p className="mt-1 text-xs text-vault-500">{rule.strategy === 'match_lowest' ? 'Niedrigsten Preis übernehmen' : `${rule.beat_by_pct} % unterbieten`} · mindestens {rule.min_margin_pct} % Marge</p></div>
                    <MutationButton id={rule.id} label="Deaktivieren" pendingLabel="Wird deaktiviert …" action={deactivate} />
                  </div>
                </article>
              ))}
              {!rules.some((rule) => rule.active) && <p className="p-5 text-sm text-vault-400">Noch keine aktive Preisregel.</p>}
            </div>
          </section>
        </div>
        <section className="panel overflow-hidden" aria-labelledby="approval-queue">
          <div className="border-b border-vault-700 px-5 py-4"><h2 id="approval-queue" className="font-semibold">Manuelle Freigabe</h2></div>
          <div className="divide-y divide-vault-700/70">
            {suggestions.map((suggestion) => (
              <article key={suggestion.id} className="p-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div>
                    <h3 className="font-semibold">{suggestion.products?.name} · {suggestion.product_variants?.name}</h3>
                    <p className="mt-1 text-xs text-vault-500">{suggestion.repricing_rules?.name}</p>
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                      <div><p className="text-xs text-vault-500">Aktuell</p><p className="mt-1 font-mono">{formatPrice(suggestion.previous_price, suggestion.product_variants?.currency)}</p></div>
                      <div><p className="text-xs text-vault-500">Marktminimum</p><p className="mt-1 font-mono">{formatPrice(suggestion.lowest_competitor_price, suggestion.product_variants?.currency)}</p></div>
                      <div><p className="text-xs text-vault-500">Preisuntergrenze</p><p className="mt-1 font-mono">{formatPrice(suggestion.margin_floor, suggestion.product_variants?.currency)}</p></div>
                      <div><p className="text-xs text-vault-500">Vorschlag</p><p className="mt-1 font-mono font-semibold text-merchant-success">{formatPrice(suggestion.suggested_price, suggestion.product_variants?.currency)}</p></div>
                    </div>
                  </div>
                  <div className="flex gap-4 lg:justify-end">
                    <MutationButton id={suggestion.id} label="Freigeben & anwenden" pendingLabel="Wird angewendet …" action={approve} tone="neutral" />
                    <MutationButton id={suggestion.id} label="Ablehnen" pendingLabel="Wird abgelehnt …" action={reject} />
                  </div>
                </div>
              </article>
            ))}
            {!suggestions.length && <p className="p-6 text-sm text-vault-400">Keine offenen Preisvorschläge.</p>}
          </div>
        </section>
      </div>
    </>
  )
}
