import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { Activity, ArrowLeft, BarChart3, CheckCircle2, Clock3, ExternalLink, Gauge, Globe2, Link2, ListChecks, Radar, ShieldCheck, Store, TrendingDown } from 'lucide-react'

import { CompetitorForm } from '@/components/ui/CompetitorForm'
import { PageHeader } from '@/components/ui/MerchantUI'
import { MutationButton } from '@/components/ui/MutationButton'
import { backendFetch, currentTenant } from '@/lib/backend'
import { minimumScrapeFrequency } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import type { Competitor, CompetitorProduct, LatestPrice } from '@/lib/types'
import { formatDelta, formatPrice, formatRelativeTime } from '@/lib/utils'

type CompetitorMapping = CompetitorProduct & {
  products: { name: string } | null
  product_variants: { name: string; our_price: number | null; currency: string } | null
}

type CompetitorSuggestionStatus = {
  id: string
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).host.replace(/^www\./, '')
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  }
}

function healthLabel(status: CompetitorProduct['health_status']) {
  if (status === 'healthy') return 'Gesund'
  if (status === 'degraded') return 'Degradiert'
  if (status === 'blocked') return 'Blockiert'
  return 'Defekt'
}

function healthClassName(status: CompetitorProduct['health_status']) {
  if (status === 'healthy') return 'bg-emerald-50 text-emerald-700'
  if (status === 'degraded') return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

export default async function EditCompetitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const tenant = await currentTenant()
  if (!tenant) notFound()
  const tenantId = tenant.id

  const { data } = await supabase
    .from('competitors')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle()
  const competitor = data as Competitor | null
  if (!competitor) notFound()
  const competitorId = competitor.id
  const minimumFrequency = minimumScrapeFrequency(tenant.plan)
  const [{ data: mappingData }, { data: latestData }, { data: suggestionData }] = await Promise.all([
    supabase
      .from('competitor_products')
      .select('*, products(name), product_variants(name,our_price,currency)')
      .eq('tenant_id', tenantId)
      .eq('competitor_id', competitorId)
      .eq('active', true)
      .order('created_at'),
    supabase
      .from('v_latest_prices')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('competitor_id', competitorId),
    supabase
      .from('match_suggestions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('competitor_id', competitorId)
      .eq('status', 'pending'),
  ])
  const mappings = (mappingData ?? []) as CompetitorMapping[]
  const latest = (latestData ?? []) as LatestPrice[]
  const suggestions = (suggestionData ?? []) as CompetitorSuggestionStatus[]
  const latestByMapping = new Map(latest.map((row) => [row.competitor_product_id, row]))
  const undercuts = latest.filter((row) => Number(row.delta_pct ?? 0) < 0).length
  const healthy = mappings.filter((mapping) => mapping.health_status === 'healthy').length
  const host = hostFromUrl(competitor.base_url)
  const lastObserved = latest
    .map((row) => row.scraped_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? competitor.last_scraped_at

  async function saveAction(formData: FormData) {
    'use server'
    const frequency = Number(formData.get('scrape_freq_h'))
    if (!Number.isInteger(frequency) || frequency < minimumFrequency) {
      return { ok: false, message: `Dein Tarif erlaubt Abrufe frühestens alle ${minimumFrequency} Stunden.` }
    }
    const client = await createClient()
    const { error } = await client
      .from('competitors')
      .update({
        shop_name: String(formData.get('shop_name')),
        base_url: String(formData.get('base_url')),
        selector_price: String(formData.get('selector_price') || '') || null,
        selector_stock: String(formData.get('selector_stock') || '') || null,
        scrape_freq_h: frequency,
      })
      .eq('tenant_id', tenantId)
      .eq('id', competitorId)
    if (error) return { ok: false, message: 'Die Änderungen konnten nicht gespeichert werden.' }
    revalidatePath('/dashboard/competitors')
    revalidatePath(`/dashboard/competitors/${competitorId}`)
    return { ok: true, message: 'Änderungen wurden gespeichert.' }
  }

  async function testAction(input: { url: string; selectorPrice: string; selectorStock: string }) {
    'use server'
    try {
      const response = await backendFetch('/scrape/test', tenantId, {
        method: 'POST',
        body: JSON.stringify({
          url: input.url,
          selector_price: input.selectorPrice || null,
          selector_stock: input.selectorStock || null,
        }),
        cache: 'no-store',
      })
      const payload = await response.json()
      if (!response.ok || !payload.scrape_ok) {
        return { ok: false, message: payload.error_msg ?? 'Der Selektor lieferte keinen Preis.' }
      }
      return {
        ok: true,
        message: `Preis erkannt: ${Number(payload.price).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`,
        price: payload.price,
        rawPriceText: payload.raw_price_text,
      }
    } catch {
      return { ok: false, message: 'Der Scraper-Dienst ist nicht erreichbar.' }
    }
  }

  async function detectAction(input: { url: string }) {
    'use server'
    try {
      const response = await backendFetch('/scrape/detect-selector', tenantId, {
        method: 'POST',
        body: JSON.stringify({ url: input.url }),
        cache: 'no-store',
      })
      const payload = await response.json()
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
      if (!response.ok) {
        return { ok: false, message: payload.detail ?? 'Der Selektor konnte nicht erkannt werden.' }
      }
      if (!candidates.length) {
        return { ok: false, message: 'Auf dieser Seite wurde kein stabiler Preis-Selektor erkannt.' }
      }
      const best = candidates[0]
      return {
        ok: true,
        message: `Selektor erkannt: ${best.selector}`,
        selector: best.selector,
        price: best.price,
        rawPriceText: best.raw_text,
        candidates: candidates.map((candidate: { selector: string; raw_text: string; price: number; confidence: number }) => ({
          selector: candidate.selector,
          rawText: candidate.raw_text,
          price: candidate.price,
          confidence: candidate.confidence,
        })),
      }
    } catch {
      return { ok: false, message: 'Der Scraper-Dienst ist nicht erreichbar.' }
    }
  }

  async function generateCatalogSuggestions(formData: FormData) {
    'use server'
    const requestedCompetitorId = String(formData.get('id') ?? '')
    if (requestedCompetitorId !== competitorId) return { ok: false, message: 'Mitbewerber stimmt nicht überein.' }
    try {
      const response = await backendFetch('/match/suggestions/generate-catalog', tenantId, {
        method: 'POST',
        body: JSON.stringify({ competitor_ids: [competitorId], limit: 5 }),
        signal: AbortSignal.timeout(120_000),
      })
      const payload = await response.json()
      if (!response.ok) return { ok: false, message: payload.detail ?? 'Die Produktsuche ist fehlgeschlagen.' }
      revalidatePath('/dashboard/products')
      revalidatePath('/dashboard/competitors')
      revalidatePath(`/dashboard/competitors/${competitorId}`)
      const suggestionCount = Number(payload.suggestions ?? 0)
      const searchedPairs = Number(payload.searched_pairs ?? 0)
      if (suggestionCount > 0) return { ok: true, message: `${suggestionCount} Vorschlag/Vorschläge vorbereitet.` }
      if (searchedPairs === 0) return { ok: true, message: 'Keine offenen Varianten für diesen Shop.' }
      return { ok: true, message: 'Keine passenden Produktseiten gefunden.' }
    } catch (error) {
      console.error('[competitors/matcher] catalog suggestion generation failed', {
        competitorId,
        error: error instanceof Error ? error.message : String(error),
      })
      return { ok: false, message: 'Die Produktsuche konnte nicht abgeschlossen werden.' }
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Quellenverwaltung"
        title={competitor.shop_name}
        description="Shopdaten, Matching-Signale und Produktquellen für diesen Mitbewerber."
        actions={<Link href="/dashboard/competitors" className="button-secondary gap-2"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Zurück</Link>}
      />

      <section className="mb-6 overflow-hidden rounded-lg border border-vault-700 bg-vault-100 text-white shadow-[0_20px_60px_rgba(26,26,26,.14)]" aria-label="Mitbewerber Status">
        <div className="grid gap-px bg-white/10 lg:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(150px,.75fr))]">
          <div className="relative overflow-hidden bg-vault-100 p-6">
            <div className="absolute inset-x-0 bottom-0 h-16 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.09)_0,rgba(255,255,255,.09)_1px,transparent_1px,transparent_9px)]" aria-hidden="true" />
            <p className="relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
              <Store className="h-3.5 w-3.5" aria-hidden="true" />
              Shop-Dossier
            </p>
            <div className="relative mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-3xl font-bold">{competitor.shop_name}</h2>
                <a className="mt-2 inline-flex min-w-0 items-center gap-2 font-mono text-xs text-white/60 transition hover:text-white" href={competitor.base_url} target="_blank" rel="noreferrer">
                  <span className="truncate">{host}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              </div>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${competitor.active ? 'bg-emerald-50 text-emerald-700' : 'bg-white/10 text-white/65'}`}>
                {competitor.active ? 'Aktiv' : 'Inaktiv'}
              </span>
            </div>
          </div>
          {[
            { label: 'Quellen', value: mappings.length, detail: `${healthy}/${mappings.length} gesund`, icon: Link2 },
            { label: 'Vorschläge', value: suggestions.length, detail: suggestions.length ? 'Freigabe offen' : 'Queue leer', icon: ListChecks },
            { label: 'Unterbietungen', value: undercuts, detail: undercuts ? 'prüfen' : 'keine erkannt', icon: TrendingDown },
            { label: 'Abruf', value: `${competitor.scrape_freq_h}h`, detail: formatRelativeTime(lastObserved), icon: Clock3 },
          ].map((item) => {
            const Icon = item.icon
            return (
              <article key={item.label} className="bg-vault-100 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{item.label}</p>
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/10">
                    <Icon className="h-4 w-4 text-white/75" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-7 font-mono text-3xl font-bold">{item.value}</p>
                <p className="mt-1 text-xs text-white/55">{item.detail}</p>
              </article>
            )
          })}
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(380px,.82fr)_minmax(0,1fr)]">
        <section className="panel overflow-hidden" aria-labelledby="competitor-settings">
          <div className="relative overflow-hidden border-b border-vault-700 bg-vault-100 p-5 text-white sm:p-6">
            <div className="absolute inset-y-0 right-0 w-32 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.10)_0,rgba(255,255,255,.10)_1px,transparent_1px,transparent_9px)]" aria-hidden="true" />
            <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
              <Gauge className="h-4 w-4" aria-hidden="true" />
              Konfiguration
            </p>
            <h2 id="competitor-settings" className="relative mt-2 text-2xl font-bold">Shopdaten bearbeiten</h2>
            <p className="relative mt-2 text-sm leading-6 text-white/65">Basis-URL, Selektoren und Abrufintervall für diese Quelle.</p>
          </div>
          <div className="p-5 sm:p-6">
            <CompetitorForm
              competitor={competitor}
              minimumFrequency={minimumFrequency}
              saveAction={saveAction}
              testAction={testAction}
              detectAction={detectAction}
            />
          </div>
        </section>

        <section className="space-y-6">
          <div className="panel overflow-hidden" aria-labelledby="competitor-signal">
            <div className="border-b border-vault-700 bg-white px-5 py-4">
              <p className="eyebrow">Matching</p>
              <h2 id="competitor-signal" className="mt-1 text-xl font-semibold">Produktfinder und Signale</h2>
            </div>
            <div className="grid gap-px bg-vault-700 sm:grid-cols-3">
              <div className="bg-white p-5">
                <p className="flex items-center gap-2 text-xs font-semibold text-vault-500"><Radar className="h-4 w-4" aria-hidden="true" />Produktvorschläge</p>
                <p className="mt-3 text-sm leading-6 text-vault-300">Suche alle noch offenen Varianten bei diesem Shop und lege prüfpflichtige Vorschläge an.</p>
                <div className="mt-4">
                  <MutationButton id={competitorId} label="Vorschläge suchen" pendingLabel="Produktsuche läuft …" action={generateCatalogSuggestions} tone="neutral" icon="sparkles" />
                </div>
              </div>
              <div className="bg-white p-5">
                <p className="flex items-center gap-2 text-xs font-semibold text-vault-500"><Globe2 className="h-4 w-4" aria-hidden="true" />Basis-URL</p>
                <a className="mt-3 block truncate font-mono text-sm font-semibold text-vault-100 hover:text-merchant-success" href={competitor.base_url} target="_blank" rel="noreferrer">{competitor.base_url}</a>
                <p className="mt-2 text-xs text-vault-500">Host: {host}</p>
              </div>
              <div className="bg-white p-5">
                <p className="flex items-center gap-2 text-xs font-semibold text-vault-500"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Quellenstatus</p>
                <p className="mt-3 font-mono text-2xl font-semibold text-vault-100">{healthy}/{mappings.length}</p>
                <p className="mt-1 text-xs text-vault-500">aktive Preisquellen gesund</p>
              </div>
            </div>
          </div>

      <section className="panel mt-6 overflow-hidden" aria-labelledby="competitor-products">
        <div className="flex flex-col gap-4 border-b border-vault-700 bg-white px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Mitbewerberanalyse</p>
            <h2 id="competitor-products" className="mt-2 text-xl font-semibold">Verfolgte Produkte</h2>
          </div>
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-vault-700 bg-vault-950 px-3 py-1 font-mono text-xs text-vault-500">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            {mappings.length} Quellen · {undercuts} Unterbietungen · {healthy}/{mappings.length} gesund
          </p>
        </div>
        {mappings.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-vault-800/70 text-[10px] uppercase text-vault-500">
                <tr>
                  <th className="px-5 py-4">Produkt</th>
                  <th className="px-4 py-4">Eigener Preis</th>
                  <th className="px-4 py-4">Mitbewerberpreis</th>
                  <th className="px-4 py-4">Position</th>
                  <th className="px-4 py-4">Bestand</th>
                  <th className="px-4 py-4">Quelle</th>
                  <th className="px-5 py-4 text-right">Abruf</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => {
                  const row = latestByMapping.get(mapping.id)
                  return (
                    <tr key={mapping.id} className="border-t border-vault-700/70">
                      <td className="px-5 py-4">
                        <Link className="font-semibold hover:text-merchant-success" href={`/dashboard/products/${mapping.product_id}`}>{mapping.products?.name ?? 'Produkt'}</Link>
                        <span className="mt-1 block text-xs text-vault-500">{mapping.product_variants?.name ?? 'Standard'}</span>
                      </td>
                      <td className="px-4 py-4 font-mono">{formatPrice(mapping.product_variants?.our_price ?? null, mapping.product_variants?.currency)}</td>
                      <td className="px-4 py-4 font-mono font-semibold">{formatPrice(row?.competitor_price ?? null, row?.our_currency)}</td>
                      <td className="px-4 py-4 font-mono">{formatDelta(row?.delta_pct ?? null)}</td>
                      <td className="px-4 py-4">{row?.in_stock === null || row?.in_stock === undefined ? 'Unbekannt' : row.in_stock ? 'Verfügbar' : 'Nicht verfügbar'}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${healthClassName(mapping.health_status)}`}>
                          {healthLabel(mapping.health_status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-xs text-vault-500">{formatRelativeTime(row?.scraped_at ?? null)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6">
            <div className="rounded-lg border border-dashed border-vault-700 bg-vault-950 px-6 py-10 text-center">
              <Activity className="mx-auto h-7 w-7 text-vault-500" aria-hidden="true" />
              <h3 className="mt-4 font-semibold">Noch keine Produkte zugeordnet.</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-vault-500">Starte den Produktfinder oder ordne eine Mitbewerber-URL auf der Produktseite manuell zu.</p>
            </div>
          </div>
        )}
      </section>
        </section>
      </div>
    </>
  )
}
