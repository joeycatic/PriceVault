import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Activity, ArrowRight, BarChart3, CheckCircle2, Clock3, ExternalLink, Gauge, Globe2, Lightbulb, Link2, ListChecks, Plus, Radar, Search, ShieldCheck, Store } from 'lucide-react'

import { CompetitorForm } from '@/components/ui/CompetitorForm'
import { PageHeader } from '@/components/ui/MerchantUI'
import { MutationButton } from '@/components/ui/MutationButton'
import { backendFetch, currentTenant } from '@/lib/backend'
import { minimumScrapeFrequency, planLimit } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import type { Competitor, StoreRecommendation } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

type CompetitorSourceStatus = {
  competitor_id: string
  active: boolean
  health_status: 'healthy' | 'degraded' | 'broken'
}

type CompetitorSuggestionStatus = {
  competitor_id: string
}

type CompetitorsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function competitorInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'S'
}

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function recommendationHref(recommendation: StoreRecommendation) {
  const params = new URLSearchParams({
    recommended_shop: recommendation.shop_name,
    recommended_url: recommendation.base_url,
  })
  return `/dashboard/competitors?${params.toString()}#new-competitor`
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).host.replace(/^www\./, '')
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  }
}

function StoreDiscoverySection({
  recommendations,
  unavailable,
}: {
  recommendations: StoreRecommendation[]
  unavailable: boolean
}) {
  const visibleRecommendations = recommendations.slice(0, 6)
  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-vault-700 bg-white shadow-panel" aria-labelledby="store-discovery">
      <div className="grid gap-px bg-vault-700 lg:grid-cols-[minmax(280px,.72fr)_minmax(0,1.55fr)]">
        <div className="relative overflow-hidden bg-vault-100 p-5 text-white sm:p-6">
          <div className="absolute inset-x-0 bottom-0 h-20 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.10)_0,rgba(255,255,255,.10)_1px,transparent_1px,transparent_10px)]" aria-hidden="true" />
          <div className="relative">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              Branchenradar
            </p>
            <h2 id="store-discovery" className="mt-4 max-w-sm text-2xl font-bold">Neue Shops als geprüfte Kandidaten.</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/65">
              Empfehlungen werden aus Branche, Markt und Produktbegriffen abgeleitet. Erst nach Freigabe werden daraus aktive Mitbewerber.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 text-xs">
              <div className="bg-white/10 p-3">
                <p className="font-mono text-xl font-semibold">{visibleRecommendations.length}</p>
                <p className="mt-1 text-white/55">Kandidaten</p>
              </div>
              <div className="bg-white/10 p-3">
                <p className="font-mono text-xl font-semibold">Queue</p>
                <p className="mt-1 text-white/55">nach Freigabe</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-vault-950 p-4 sm:p-5">
          {visibleRecommendations.length ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {visibleRecommendations.map((recommendation) => (
                <article key={recommendation.host} className="group flex min-h-56 flex-col justify-between rounded-lg border border-vault-700 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-vault-500 hover:shadow-[0_18px_38px_rgba(26,26,26,.10)]">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold">{recommendation.shop_name}</h3>
                        <p className="mt-1 truncate font-mono text-xs text-vault-500">{recommendation.host}</p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        {Math.round(recommendation.confidence * 100)}%
                      </span>
                    </div>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-vault-800" aria-hidden="true">
                      <div className="h-full rounded-full bg-merchant-success" style={{ width: `${Math.round(recommendation.confidence * 100)}%` }} />
                    </div>
                    <p className="mt-4 text-xs leading-5 text-vault-500">{recommendation.reasons.join(' · ')}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-vault-700 pt-4">
                    <a className="inline-flex items-center gap-1 text-xs font-semibold text-vault-500 transition hover:text-merchant-success" href={recommendation.base_url} target="_blank" rel="noreferrer">
                      Shop prüfen
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                    <Link className="button-primary min-h-9 px-3 py-2 text-xs" href={recommendationHref(recommendation)}>
                      Übernehmen
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-vault-700 bg-white p-6 text-sm leading-6 text-vault-500">
              <p className="flex items-center gap-2 font-semibold text-vault-100">
                <Search className="h-4 w-4" aria-hidden="true" />
                Noch keine Shop-Vorschläge sichtbar.
              </p>
              <p className="mt-2">
                {unavailable ? 'Der Backend-Dienst ist gerade nicht erreichbar.' : 'Pflege Branche und Produkte, damit PriceVault passende Wettbewerber ableiten kann.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default async function CompetitorsPage({ searchParams }: CompetitorsPageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const tenant = await currentTenant()
  const [{ data }, { data: sourceData }, { data: suggestionData }] = tenant
    ? await Promise.all([
        supabase.from('competitors').select('*').eq('tenant_id', tenant.id).order('shop_name'),
        supabase.from('competitor_products').select('competitor_id, active, health_status').eq('tenant_id', tenant.id),
        supabase.from('match_suggestions').select('competitor_id').eq('tenant_id', tenant.id).eq('status', 'pending'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]
  const competitors = (data ?? []) as Competitor[]
  const sources = (sourceData ?? []) as CompetitorSourceStatus[]
  const suggestionRows = (suggestionData ?? []) as CompetitorSuggestionStatus[]
  const minimumFrequency = minimumScrapeFrequency(tenant?.plan)
  const competitorLimit = planLimit(tenant?.plan).competitors
  const activeCompetitors = competitors.filter((competitor) => competitor.active)
  const inactiveCompetitors = competitors.length - activeCompetitors.length
  const activeSources = sources.filter((source) => source.active)
  const healthySources = activeSources.filter((source) => source.health_status === 'healthy')
  const brokenSources = activeSources.filter((source) => source.health_status === 'broken')
  const pendingSuggestions = suggestionRows.length
  let storeRecommendations: StoreRecommendation[] = []
  let recommendationsUnavailable = false
  if (tenant) {
    try {
      const response = await backendFetch('/competitors/recommendations?limit=6', tenant.id, { cache: 'no-store' })
      if (response.ok) {
        const payload = (await response.json()) as { recommendations?: StoreRecommendation[] }
        storeRecommendations = Array.isArray(payload.recommendations) ? payload.recommendations : []
      } else {
        recommendationsUnavailable = true
      }
    } catch {
      recommendationsUnavailable = true
      storeRecommendations = []
    }
  }
  const recommendedShop = stringParam(params?.recommended_shop).slice(0, 120)
  const recommendedUrl = stringParam(params?.recommended_url).slice(0, 2048)
  const sourceCountByCompetitor = new Map<string, number>()
  for (const source of activeSources) {
    sourceCountByCompetitor.set(source.competitor_id, (sourceCountByCompetitor.get(source.competitor_id) ?? 0) + 1)
  }
  const suggestionCountByCompetitor = new Map<string, number>()
  for (const suggestion of suggestionRows) {
    suggestionCountByCompetitor.set(suggestion.competitor_id, (suggestionCountByCompetitor.get(suggestion.competitor_id) ?? 0) + 1)
  }

  async function saveAction(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const frequency = Number(formData.get('scrape_freq_h'))
    if (!Number.isInteger(frequency) || frequency < minimumFrequency) {
      return { ok: false, message: `Dein Tarif erlaubt Abrufe frühestens alle ${minimumFrequency} Stunden.` }
    }
    const client = await createClient()
    if (competitorLimit !== null) {
      const { count, error: countError } = await client
        .from('competitors')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('active', true)
      if (countError) return { ok: false, message: 'Das Mitbewerberlimit konnte nicht geprüft werden.' }
      if ((count ?? 0) >= competitorLimit) {
        return { ok: false, message: `Dein Plan erlaubt maximal ${competitorLimit} aktive Mitbewerber.` }
      }
    }
    const { data: createdCompetitor, error } = await client.from('competitors').insert({
      tenant_id: tenant.id,
      shop_name: String(formData.get('shop_name')),
      base_url: String(formData.get('base_url')),
      selector_price: String(formData.get('selector_price') || '') || null,
      selector_stock: String(formData.get('selector_stock') || '') || null,
      scrape_freq_h: frequency,
    }).select('id').single()
    if (error) return { ok: false, message: 'Der Mitbewerber konnte nicht gespeichert werden.' }
    let matchMessage = ''
    if (createdCompetitor?.id) {
      try {
        const response = await backendFetch('/match/suggestions/generate-catalog', tenant.id, {
          method: 'POST',
          body: JSON.stringify({ competitor_ids: [createdCompetitor.id], limit: 5 }),
          signal: AbortSignal.timeout(120_000),
        })
        const payload = await response.json()
        if (response.ok && Number(payload.suggestions) > 0) {
          matchMessage = ` ${Number(payload.suggestions)} Produktvorschlag/Vorschläge wurden vorbereitet.`
        } else if (response.ok && Number(payload.searched_pairs) === 0) {
          matchMessage = ' Es gibt aktuell keine offenen Varianten für diesen Shop.'
        }
      } catch {
        matchMessage = ' Die automatische Produktsuche konnte nicht abgeschlossen werden; manuelle URLs bleiben verfügbar.'
      }
    }
    revalidatePath('/dashboard/competitors')
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard')
    return { ok: true, message: `Mitbewerber wurde angelegt.${matchMessage}` }
  }

  async function generateMissingMatches(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const competitorId = String(formData.get('id') ?? '')
    if (!competitorId) return { ok: false, message: 'Mitbewerber fehlt.' }
    try {
      const response = await backendFetch('/match/suggestions/generate-catalog', tenant.id, {
        method: 'POST',
        body: JSON.stringify({ competitor_ids: [competitorId], limit: 5 }),
        signal: AbortSignal.timeout(120_000),
      })
      const payload = await response.json()
      if (!response.ok) return { ok: false, message: payload.detail ?? 'Die Produktsuche ist fehlgeschlagen.' }
      revalidatePath('/dashboard/products')
      revalidatePath('/dashboard/competitors')
      const suggestions = Number(payload.suggestions ?? 0)
      const searchedPairs = Number(payload.searched_pairs ?? 0)
      if (suggestions > 0) return { ok: true, message: `${suggestions} Vorschlag/Vorschläge vorbereitet.` }
      if (searchedPairs === 0) return { ok: true, message: 'Keine offenen Varianten für diesen Shop.' }
      return { ok: true, message: 'Keine passenden Produktseiten gefunden.' }
    } catch {
      return { ok: false, message: 'Die Produktsuche konnte nicht abgeschlossen werden.' }
    }
  }

  async function testAction(input: { url: string; selectorPrice: string; selectorStock: string }) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    try {
      const response = await backendFetch('/scrape/test', tenant.id, {
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
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    try {
      const response = await backendFetch('/scrape/detect-selector', tenant.id, {
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

  async function remove(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const { error } = await client
      .from('competitors')
      .update({ active: false })
      .eq('tenant_id', tenant.id)
      .eq('id', String(formData.get('id')))
    if (error) return { ok: false, message: 'Mitbewerber konnte nicht deaktiviert werden.' }
    await client
      .from('competitor_products')
      .update({ active: false })
      .eq('tenant_id', tenant.id)
      .eq('competitor_id', String(formData.get('id')))
    revalidatePath('/dashboard/competitors')
    revalidatePath('/dashboard')
    return { ok: true, message: 'Mitbewerber deaktiviert.' }
  }

  return (
    <>
      <PageHeader
        eyebrow="Quellenverwaltung"
        title="Mitbewerber"
        description="Behalte Wettbewerber, Scrape-Intervalle und Quellenqualität als aktives Markt-Radar im Blick."
        actions={<a href="#new-competitor" className="button-primary gap-2"><Plus className="h-4 w-4" aria-hidden="true" /> Neue Quelle</a>}
      />

      <section className="mb-6 overflow-hidden rounded-lg border border-vault-700 bg-vault-100 text-white shadow-[0_20px_60px_rgba(26,26,26,.14)]" aria-label="Mitbewerber Überblick">
        <div className="grid gap-px bg-white/10 lg:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(150px,.75fr))]">
          <div className="relative overflow-hidden bg-vault-100 p-6">
            <div className="absolute inset-x-0 bottom-0 h-16 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.09)_0,rgba(255,255,255,.09)_1px,transparent_1px,transparent_9px)]" aria-hidden="true" />
            <p className="relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
              <Radar className="h-4 w-4" aria-hidden="true" />
              Markt-Radar
            </p>
            <h2 className="relative mt-4 max-w-lg text-3xl font-bold">Deine Wettbewerbsquellen als operatives Board.</h2>
            <p className="relative mt-3 max-w-xl text-sm leading-6 text-white/65">
              Prüfe Abdeckung, Abrufrhythmus und defekte Quellen, bevor daraus Preisalarme oder Reports entstehen.
            </p>
          </div>
          {[
            { label: 'Aktive Shops', value: activeCompetitors.length, detail: inactiveCompetitors ? `${inactiveCompetitors} deaktiviert` : 'Alle aktiv', icon: Store },
            { label: 'Quellen', value: activeSources.length, detail: `${healthySources.length} gesund`, icon: Link2 },
            { label: 'Vorschläge', value: pendingSuggestions, detail: pendingSuggestions ? 'Freigabe offen' : 'Queue leer', icon: ListChecks },
            { label: 'Defekte Quellen', value: brokenSources.length, detail: brokenSources.length ? 'Handlungsbedarf' : 'Keine defekten Quellen', icon: ShieldCheck },
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

      <StoreDiscoverySection recommendations={storeRecommendations} unavailable={recommendationsUnavailable} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,.8fr)]">
        <section className="panel overflow-hidden" aria-labelledby="competitor-list">
          <div className="flex flex-col gap-3 border-b border-vault-700 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="eyebrow">Quellenbestand</p>
              <h2 id="competitor-list" className="mt-1 text-xl font-semibold">Erfasste Shops</h2>
            </div>
            <p className="rounded-full border border-vault-700 bg-vault-950 px-3 py-1 text-xs font-semibold text-vault-500">
              {competitorLimit === null ? `${activeCompetitors.length} aktiv` : `${activeCompetitors.length}/${competitorLimit} aktiv`}
            </p>
          </div>
          {competitors.length ? (
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              {competitors.map((competitor) => (
                <article
                  key={competitor.id}
                  className="group relative overflow-hidden rounded-lg border border-vault-700 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-vault-500 hover:shadow-[0_16px_40px_rgba(26,26,26,.10)]"
                >
                  <div className="grid min-h-48 sm:grid-cols-[96px_minmax(0,1fr)]">
                    <div className="relative bg-vault-100 p-4 text-white">
                      <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.10)_0,rgba(255,255,255,.10)_1px,transparent_1px,transparent_9px)] opacity-70" aria-hidden="true" />
                      <span className="relative grid h-14 w-14 place-items-center rounded-lg border border-white/15 bg-white/10 text-lg font-black">
                        {competitorInitials(competitor.shop_name)}
                      </span>
                      <p className="relative mt-8 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">{hostFromUrl(competitor.base_url)}</p>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-lg font-bold">{competitor.shop_name}</h3>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${competitor.active ? 'bg-emerald-50 text-emerald-700' : 'bg-vault-800 text-vault-500'}`}>
                              {competitor.active ? 'Aktiv' : 'Inaktiv'}
                            </span>
                          </div>
                          <a
                            className="mt-1 flex min-w-0 items-center gap-1 font-mono text-xs text-vault-500 transition hover:text-merchant-success"
                            href={competitor.base_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span className="truncate">{competitor.base_url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                          </a>
                        </div>
                        <Link className="button-secondary min-h-9 px-3 py-2 text-xs" href={`/dashboard/competitors/${competitor.id}`}>Bearbeiten</Link>
                      </div>

                      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
                        <div>
                          <dt className="flex items-center gap-1 text-vault-500"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Intervall</dt>
                          <dd className="mt-1 font-semibold">Alle {competitor.scrape_freq_h} Std.</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 text-vault-500"><Activity className="h-3.5 w-3.5" aria-hidden="true" />Quellen</dt>
                          <dd className="mt-1 font-semibold">{sourceCountByCompetitor.get(competitor.id) ?? 0}</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 text-vault-500"><ListChecks className="h-3.5 w-3.5" aria-hidden="true" />Vorschläge</dt>
                          <dd className="mt-1 font-semibold">{suggestionCountByCompetitor.get(competitor.id) ?? 0}</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-1 text-vault-500"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Abruf</dt>
                          <dd className="mt-1 truncate font-semibold">{formatRelativeTime(competitor.last_scraped_at)}</dd>
                        </div>
                      </dl>

                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-vault-700 pt-4">
                        <div className="flex min-w-0 items-center gap-2 text-xs text-vault-500">
                          <Globe2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="truncate font-mono">{competitor.selector_price || 'Selektor wird pro Produkt gesetzt'}</span>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {competitor.active && (
                            <MutationButton id={competitor.id} label={`Produktvorschläge für ${competitor.shop_name} suchen`} pendingLabel="Produktsuche läuft …" action={generateMissingMatches} tone="neutral" icon="sparkles" iconOnly />
                          )}
                          {competitor.active && (
                            <MutationButton id={competitor.id} label={`${competitor.shop_name} deaktivieren`} pendingLabel="Wird deaktiviert …" action={remove} icon="trash" iconOnly />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="p-6">
              <div className="rounded-xl border border-dashed border-vault-700 bg-vault-950 px-6 py-10 text-center">
                <Radar className="mx-auto h-7 w-7 text-vault-500" aria-hidden="true" />
                <h3 className="mt-4 font-semibold">Noch keine Mitbewerber angelegt.</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-vault-500">
                  Lege deinen ersten Shop an, teste den Preis-Selektor und verbinde danach Produkte.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="panel overflow-hidden xl:sticky xl:top-20" aria-labelledby="new-competitor">
          <div className="relative overflow-hidden border-b border-vault-700 bg-vault-100 p-5 text-white sm:p-6">
            <div className="absolute inset-y-0 right-0 w-32 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.10)_0,rgba(255,255,255,.10)_1px,transparent_1px,transparent_9px)]" aria-hidden="true" />
            <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
              <Gauge className="h-4 w-4" aria-hidden="true" />
              Neue Quelle
            </p>
            <h2 id="new-competitor" className="relative mt-2 text-2xl font-bold">Mitbewerber anlegen</h2>
            <p className="relative mt-2 text-sm leading-6 text-white/65">
              Starte mit einem Shop. PriceVault sucht danach passende Produktseiten; manuelle URLs überschreiben verpasste Treffer.
            </p>
            {competitorLimit !== null && (
              <div className="relative mt-4 rounded-lg bg-white/10 p-3 text-xs text-white/70">
                Dein Plan nutzt <strong className="text-white">{activeCompetitors.length} von {competitorLimit}</strong> Mitbewerbern.
              </div>
            )}
          </div>
          <div className="p-5 sm:p-6">
            <CompetitorForm
              initialShopName={recommendedShop}
              initialBaseUrl={recommendedUrl}
              minimumFrequency={minimumFrequency}
              saveAction={saveAction}
              testAction={testAction}
              detectAction={detectAction}
            />
          </div>
        </section>
      </div>
    </>
  )
}
