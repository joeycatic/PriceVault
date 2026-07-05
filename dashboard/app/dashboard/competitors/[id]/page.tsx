import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'

import { CompetitorForm } from '@/components/ui/CompetitorForm'
import { PageHeader } from '@/components/ui/MerchantUI'
import { backendFetch, currentTenant } from '@/lib/backend'
import { minimumScrapeFrequency } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import type { Competitor, CompetitorProduct, LatestPrice } from '@/lib/types'
import { formatDelta, formatPrice, formatRelativeTime } from '@/lib/utils'

type CompetitorMapping = CompetitorProduct & {
  products: { name: string } | null
  product_variants: { name: string; our_price: number | null; currency: string } | null
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
  const [{ data: mappingData }, { data: latestData }] = await Promise.all([
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
  ])
  const mappings = (mappingData ?? []) as CompetitorMapping[]
  const latest = (latestData ?? []) as LatestPrice[]
  const latestByMapping = new Map(latest.map((row) => [row.competitor_product_id, row]))
  const undercuts = latest.filter((row) => Number(row.delta_pct ?? 0) < 0).length
  const healthy = mappings.filter((mapping) => mapping.health_status === 'healthy').length

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

  return (
    <>
      <PageHeader
        eyebrow="Quellenverwaltung"
        title={competitor.shop_name}
        description="Shopdaten und Selektoren bearbeiten."
        actions={<Link href="/dashboard/competitors" className="button-secondary">Zurück</Link>}
      />
      <section className="panel max-w-3xl p-5 sm:p-7">
        <CompetitorForm
          competitor={competitor}
          minimumFrequency={minimumFrequency}
          saveAction={saveAction}
          testAction={testAction}
          detectAction={detectAction}
        />
      </section>
      <section className="panel mt-6 overflow-hidden" aria-labelledby="competitor-products">
        <div className="flex flex-col gap-4 border-b border-vault-700 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Mitbewerberanalyse</p>
            <h2 id="competitor-products" className="mt-2 text-xl font-semibold">Verfolgte Produkte</h2>
          </div>
          <p className="font-mono text-xs text-vault-500">
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
                      <td className="px-4 py-4">{mapping.health_status === 'healthy' ? 'Gesund' : mapping.health_status === 'degraded' ? 'Degradiert' : 'Defekt'}</td>
                      <td className="px-5 py-4 text-right text-xs text-vault-500">{formatRelativeTime(row?.scraped_at ?? null)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-sm text-vault-400">Für diesen Mitbewerber sind noch keine Produkte zugeordnet.</p>
        )}
      </section>
    </>
  )
}
