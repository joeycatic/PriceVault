import { revalidatePath } from 'next/cache'
import Link from 'next/link'

import { ManualScrapeButton } from '@/components/ui/ManualScrapeButton'
import { PageHeader } from '@/components/ui/MerchantUI'
import { MutationButton } from '@/components/ui/MutationButton'
import { MappingForm, MatchSuggestionForm, ProductForm, ProductImportForm, VariantForm } from '@/components/ui/ProductForms'
import { runManualScrape } from '@/app/dashboard/scrape-actions'
import { ExportButton } from '@/app/dashboard/products/[id]/ExportButton'
import { backendFetch, currentTenant } from '@/lib/backend'
import { parsePriceInput } from '@/lib/priceInput'
import { planLimit } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import type { Competitor, CompetitorProduct, LatestPrice, MatchSuggestion, Product, ProductVariant } from '@/lib/types'
import { formatPrice, formatRelativeTime } from '@/lib/utils'

type MappingRow = CompetitorProduct & {
  products: { name: string } | null
  product_variants: { name: string; sku: string | null; our_price: number | null; currency: string } | null
  competitors: { shop_name: string; scrape_freq_h: number } | null
}

function splitProductLine(line: string) {
  const delimiter = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ','
  const parts = line.split(delimiter).map((part) => part.trim()).filter(Boolean)
  if (parts.length <= 3) return parts

  return [parts[0], parts[1], parts.slice(2).join(delimiter)]
}

function parseProductImport(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitProductLine)
    .filter((parts, index) => {
      if (index !== 0) return true
      const firstCell = parts[0]?.toLowerCase().replace(/\s|_/g, '') ?? ''
      return !['name', 'produkt', 'product', 'productname', 'produktname'].includes(firstCell)
    })
    .map((parts) => {
      const [name = '', second = '', third = ''] = parts
      const priceCandidate = third || (parsePriceInput(second) !== null ? second : '')
      const sku = third ? second : priceCandidate ? '' : second
      return {
        name: name.trim(),
        our_sku: sku.trim() || null,
        our_price: priceCandidate ? parsePriceInput(priceCandidate) : null,
        our_currency: 'EUR',
      }
    })
}

export default async function ProductsPage() {
  const supabase = await createClient()
  const tenant = await currentTenant()

  const [productResult, variantResult, competitorResult, mappingResult, latestResult, suggestionResult] = tenant
    ? await Promise.all([
        supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('active', true).order('name'),
        supabase.from('product_variants').select('*').eq('tenant_id', tenant.id).eq('active', true).order('name'),
        supabase.from('competitors').select('*').eq('tenant_id', tenant.id).eq('active', true).order('shop_name'),
        supabase
          .from('competitor_products')
          .select('*, products(name), product_variants(name,sku,our_price,currency), competitors(shop_name,scrape_freq_h)')
          .eq('tenant_id', tenant.id)
          .eq('active', true)
          .order('created_at'),
        supabase.from('v_latest_prices').select('*').eq('tenant_id', tenant.id),
        supabase
          .from('match_suggestions')
          .select('*, products(name), product_variants(name,sku,gtin), competitors(shop_name)')
          .eq('tenant_id', tenant.id)
          .eq('status', 'pending')
          .order('confidence', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const products = (productResult.data ?? []) as Product[]
  const variants = (variantResult.data ?? []) as ProductVariant[]
  const competitors = (competitorResult.data ?? []) as Competitor[]
  const mappings = (mappingResult.data ?? []) as MappingRow[]
  const latestRows = (latestResult.data ?? []) as LatestPrice[]
  const suggestions = (suggestionResult.data ?? []) as MatchSuggestion[]
  const latestByMapping = new Map(latestRows.map((row) => [row.competitor_product_id, row]))
  const productLimit = planLimit(tenant?.plan).products
  const unhealthyMappings = mappings.filter((mapping) => ['degraded', 'broken'].includes(mapping.health_status))

  async function createProduct(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const name = String(formData.get('name') ?? '').trim()
    const rawPrice = String(formData.get('our_price') ?? '').trim()
    const price = rawPrice ? parsePriceInput(rawPrice) : null
    if (!name || (rawPrice && price === null) || (price !== null && price < 0)) {
      return { ok: false, message: 'Bitte prüfe Produktname und Preis.' }
    }
    const limit = planLimit(tenant.plan).products
    if (limit !== null) {
      const { count, error: countError } = await client
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('active', true)
      if (countError) return { ok: false, message: 'Das Produktlimit konnte nicht geprüft werden.' }
      if ((count ?? 0) >= limit) {
        return { ok: false, message: `Dein Plan erlaubt maximal ${limit} aktive Produkte.` }
      }
    }
    const sku = String(formData.get('our_sku') || '') || null
    const { data: product, error } = await client.from('products').insert({
      tenant_id: tenant.id,
      name,
      our_sku: sku,
      our_price: price,
      our_currency: 'EUR',
    }).select('id').single()
    if (error || !product) return { ok: false, message: 'Das Produkt konnte nicht angelegt werden.' }
    const { error: variantError } = await client.from('product_variants').insert({
      tenant_id: tenant.id,
      product_id: product.id,
      name: 'Standard',
      sku,
      our_price: price,
      currency: 'EUR',
      is_default: true,
    })
    if (variantError) {
      await client.from('products').delete().eq('tenant_id', tenant.id).eq('id', product.id)
      return { ok: false, message: 'Die Standardvariante konnte nicht angelegt werden.' }
    }
    revalidatePath('/dashboard/products')
    return { ok: true, message: 'Produkt wurde angelegt.' }
  }

  async function importProducts(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const pasted = String(formData.get('products_csv') ?? '').trim()
    const file = formData.get('products_file')
    const fileText = file instanceof File && file.size > 0 ? await file.text() : ''
    const rows = parseProductImport([pasted, fileText].filter(Boolean).join('\n')).filter((row) => row.name)

    if (!rows.length) return { ok: false, message: 'Füge mindestens ein Produkt ein oder lade eine CSV-Datei hoch.' }
    if (rows.length > 250) return { ok: false, message: 'Bitte importiere maximal 250 Produkte auf einmal.' }
    if (rows.some((row) => row.our_price !== null && row.our_price < 0)) {
      return { ok: false, message: 'Mindestens ein Preis ist ungültig.' }
    }
    const limit = planLimit(tenant.plan).products
    if (limit !== null) {
      const { count, error: countError } = await client
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('active', true)
      if (countError) return { ok: false, message: 'Das Produktlimit konnte nicht geprüft werden.' }
      const activeCount = count ?? 0
      if (activeCount + rows.length > limit) {
        return { ok: false, message: `Dein Plan erlaubt maximal ${limit} aktive Produkte. Du kannst noch ${Math.max(0, limit - activeCount)} importieren.` }
      }
    }

    const { data: inserted, error } = await client
      .from('products')
      .insert(rows.map((row) => ({ ...row, tenant_id: tenant.id })))
      .select('id,our_sku,our_price,our_currency')
    if (error || !inserted) return { ok: false, message: 'Die Produkte konnten nicht importiert werden.' }
    const { error: variantError } = await client.from('product_variants').insert(inserted.map((product) => ({
      tenant_id: tenant.id,
      product_id: product.id,
      name: 'Standard',
      sku: product.our_sku,
      our_price: product.our_price,
      currency: product.our_currency,
      is_default: true,
    })))
    if (variantError) return { ok: false, message: 'Produkte importiert, aber Varianten konnten nicht angelegt werden.' }

    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard')
    return { ok: true, message: `${rows.length} Produkt(e) importiert.` }
  }

  async function createVariant(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const productId = String(formData.get('product_id') ?? '')
    const name = String(formData.get('name') ?? '').trim()
    const rawPrice = String(formData.get('our_price') ?? '').trim()
    const rawCost = String(formData.get('cost_price') ?? '').trim()
    const price = rawPrice ? parsePriceInput(rawPrice) : null
    const cost = rawCost ? parsePriceInput(rawCost) : null
    if (!productId || !name || (rawPrice && price === null) || (rawCost && cost === null)) {
      return { ok: false, message: 'Bitte prüfe Produkt, Variantenname und Preise.' }
    }
    const { data: product } = await client.from('products').select('id').eq('tenant_id', tenant.id).eq('id', productId).maybeSingle()
    if (!product) return { ok: false, message: 'Produkt nicht gefunden.' }
    const gtin = String(formData.get('gtin') ?? '').trim()
    const { error } = await client.from('product_variants').insert({
      tenant_id: tenant.id,
      product_id: productId,
      name,
      sku: String(formData.get('sku') ?? '').trim() || null,
      gtin: gtin || null,
      our_price: price,
      cost_price: cost,
      currency: 'EUR',
      is_default: false,
    })
    if (error) return { ok: false, message: 'Variante konnte nicht angelegt werden. SKU und GTIN müssen eindeutig sein.' }
    revalidatePath('/dashboard/products')
    revalidatePath(`/dashboard/products/${productId}`)
    return { ok: true, message: 'Variante wurde angelegt.' }
  }

  async function createMapping(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const productId = String(formData.get('product_id') ?? '')
    const competitorId = String(formData.get('competitor_id') ?? '')
    const variantId = String(formData.get('variant_id') ?? '')
    const competitorUrl = String(formData.get('competitor_url') ?? '').trim()
    if (!productId || !variantId || !competitorId || !competitorUrl) {
      return { ok: false, message: 'Produkt, Variante, Mitbewerber und URL sind erforderlich.' }
    }
    const { data: variant } = await client
      .from('product_variants')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('product_id', productId)
      .eq('id', variantId)
      .maybeSingle()
    if (!variant) return { ok: false, message: 'Die Variante gehört nicht zum ausgewählten Produkt.' }
    const { data, error } = await client.from('competitor_products').insert({
      tenant_id: tenant.id,
      product_id: productId,
      variant_id: variantId,
      competitor_id: competitorId,
      competitor_url: competitorUrl,
      competitor_sku: String(formData.get('competitor_sku') || '') || null,
      selector_price: String(formData.get('selector_price') || '') || null,
    })
      .select('id')
      .single()
    if (error) {
      return { ok: false, message: 'Die Zuordnung konnte nicht gespeichert werden. Prüfe, ob sie bereits existiert.' }
    }
    if (data?.id) {
      try {
        await backendFetch('/scrape/run', tenant.id, {
          method: 'POST',
          body: JSON.stringify({ tenant_id: tenant.id, competitor_product_ids: [data.id] }),
          signal: AbortSignal.timeout(15_000),
        })
      } catch {
        // Die Quelle ist gespeichert; der nächste automatische Abruf übernimmt.
      }
    }
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard')
    return { ok: true, message: 'Preisquelle wurde zugeordnet.' }
  }

  async function generateSuggestions(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    try {
      const response = await backendFetch('/match/suggestions/generate', tenant.id, {
        method: 'POST',
        body: JSON.stringify({
          variant_id: String(formData.get('variant_id') ?? ''),
          competitor_id: String(formData.get('competitor_id') ?? ''),
        }),
        signal: AbortSignal.timeout(120_000),
      })
      const payload = await response.json()
      if (!response.ok) return { ok: false, message: payload.detail ?? 'Die Vorschlagssuche ist fehlgeschlagen.' }
      revalidatePath('/dashboard/products')
      return {
        ok: true,
        message: payload.length ? `${payload.length} Vorschlag/Vorschläge gefunden.` : 'Keine passenden Produktseiten gefunden.',
      }
    } catch {
      return { ok: false, message: 'Der Matcher-Dienst ist nicht erreichbar.' }
    }
  }

  async function reviewSuggestion(formData: FormData, decision: 'approve' | 'reject') {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const id = String(formData.get('id') ?? '')
    try {
      const response = await backendFetch(`/match/suggestions/${id}/${decision}`, tenant.id, {
        method: 'POST',
      })
      const payload = await response.json()
      if (!response.ok) return { ok: false, message: payload.detail ?? 'Der Vorschlag konnte nicht bearbeitet werden.' }
      revalidatePath('/dashboard/products')
      revalidatePath('/dashboard')
      return { ok: true, message: decision === 'approve' ? 'Vorschlag freigegeben.' : 'Vorschlag abgelehnt.' }
    } catch {
      return { ok: false, message: 'Der Matcher-Dienst ist nicht erreichbar.' }
    }
  }

  async function approveSuggestion(formData: FormData) {
    'use server'
    return reviewSuggestion(formData, 'approve')
  }

  async function rejectSuggestion(formData: FormData) {
    'use server'
    return reviewSuggestion(formData, 'reject')
  }

  async function repairSource(formData: FormData) {
    'use server'
    if (!tenant) return
    const id = String(formData.get('id') ?? '')
    const competitorUrl = String(formData.get('competitor_url') ?? '').trim()
    const selectorPrice = String(formData.get('selector_price') ?? '').trim()
    const response = await backendFetch(`/scrape/sources/${id}/repair`, tenant.id, {
      method: 'POST',
      body: JSON.stringify({
        competitor_url: competitorUrl || undefined,
        selector_price: selectorPrice || null,
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) return
    const payload = (await response.json()) as { repaired?: boolean }
    if (!payload.repaired) return
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard')
  }

  async function deleteMapping(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const { error } = await client
      .from('competitor_products')
      .delete()
      .eq('tenant_id', tenant.id)
      .eq('id', String(formData.get('id')))
    if (error) return { ok: false, message: 'Zuordnung konnte nicht entfernt werden.' }
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard')
    return { ok: true, message: 'Zuordnung entfernt.' }
  }

  async function deactivateProduct(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const productId = String(formData.get('id'))
    const { error } = await client
      .from('products')
      .update({ active: false })
      .eq('tenant_id', tenant.id)
      .eq('id', productId)
    if (error) return { ok: false, message: 'Produkt konnte nicht deaktiviert werden.' }
    await client
      .from('competitor_products')
      .update({ active: false })
      .eq('tenant_id', tenant.id)
      .eq('product_id', productId)
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard')
    return { ok: true, message: 'Produkt deaktiviert.' }
  }

  return (
    <>
      <PageHeader
        eyebrow="Katalog / Preisquellen"
        title="Produkte"
        description="Pflege deine eigenen Produkte, importiere größere Listen und verbinde sie mit den Produktseiten deiner Mitbewerber."
      />

      {!tenant ? (
        <div className="panel p-6 text-sm text-amber-800">Für dieses Konto wurde noch kein Mandant eingerichtet.</div>
      ) : (
        <div className="space-y-6">
          <section className="panel p-5 sm:p-6" aria-labelledby="scrape-clarity">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div>
                <p className="eyebrow">Preisabruf</p>
                <h2 id="scrape-clarity" className="mt-2 text-xl font-semibold">Wann werden Preise gescraped?</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-vault-300">
                  PriceVault ruft jede aktive Preisquelle nach ihrem hinterlegten Intervall ab. Der nächste Lauf wird aus dem letzten erfolgreichen Abruf berechnet; einen manuellen Abruf kannst du jederzeit starten.
                </p>
              </div>
              <ManualScrapeButton action={runManualScrape} disabled={!mappings.length} />
            </div>
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-3">
            <section className="panel p-5 sm:p-6" aria-labelledby="new-product">
              <p className="eyebrow">Importoption 01</p>
              <h2 id="new-product" className="mb-5 mt-2 text-xl font-semibold">Ein Produkt manuell anlegen</h2>
              <ProductForm action={createProduct} />
            </section>

            <section className="panel p-5 sm:p-6" aria-labelledby="bulk-import">
              <p className="eyebrow">Importoption 02 / 03</p>
              <h2 id="bulk-import" className="mb-5 mt-2 text-xl font-semibold">Produkte per CSV importieren</h2>
              <ProductImportForm action={importProducts} />
            </section>
            <section className="panel p-5 sm:p-6" aria-labelledby="new-variant">
              <p className="eyebrow">Varianten</p>
              <h2 id="new-variant" className="mb-5 mt-2 text-xl font-semibold">Variante ergänzen</h2>
              <VariantForm action={createVariant} products={products} />
            </section>
          </div>

          {productLimit !== null && (
            <p className="text-sm text-vault-400">
              Dein Plan nutzt {products.length} von {productLimit} aktiven Produkten.
            </p>
          )}

          {unhealthyMappings.length > 0 && (
            <section className="panel border-l-4 border-l-amber-400 p-5" aria-labelledby="source-health">
              <h2 id="source-health" className="text-base font-semibold">Preisquellen benötigen Aufmerksamkeit</h2>
              <p className="mt-2 text-sm leading-6 text-vault-300">
                {unhealthyMappings.length} Quelle(n) sind degradiert oder defekt. Repariere URL oder Preis-Selektor und starte danach einen Testabruf.
              </p>
            </section>
          )}

          <section className="panel overflow-hidden" aria-labelledby="matching-workspace">
            <div className="border-b border-vault-700 px-5 py-4 sm:px-6">
              <p className="eyebrow">Produkt-Matching</p>
              <h2 id="matching-workspace" className="mt-2 text-xl font-semibold">Produkte zuordnen</h2>
            </div>
            <div className="grid items-start gap-0 divide-y divide-vault-700 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="p-5 sm:p-6">
                <h3 className="mb-5 font-semibold">Mit URL manuell zuordnen</h3>
                <MappingForm action={createMapping} products={products} variants={variants} competitors={competitors} />
              </div>
              <div className="p-5 sm:p-6">
                <h3 className="mb-5 font-semibold">Automatische Vorschläge</h3>
                <MatchSuggestionForm action={generateSuggestions} products={products} variants={variants} competitors={competitors} />
              </div>
            </div>
            <div className="border-t border-vault-700">
              <div className="flex items-center justify-between px-5 py-4 sm:px-6">
                <h3 className="font-semibold">Freigabewarteschlange</h3>
                <span className="font-mono text-xs text-vault-500">{suggestions.length} offen</span>
              </div>
              {suggestions.length ? (
                <div className="divide-y divide-vault-700/70 border-t border-vault-700">
                  {suggestions.map((suggestion) => (
                    <article key={suggestion.id} className="grid gap-4 p-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_120px_auto] lg:items-center">
                      <div className="min-w-0">
                        <p className="font-semibold">{suggestion.products?.name} · {suggestion.product_variants?.name}</p>
                        <p className="mt-1 text-sm text-vault-300">{suggestion.candidate_title}</p>
                        <a className="mt-1 block truncate font-mono text-xs text-merchant-success hover:underline" href={suggestion.candidate_url} target="_blank" rel="noreferrer">
                          {suggestion.candidate_url}
                        </a>
                      </div>
                      <div>
                        <p className="font-mono text-sm font-semibold">{Number(suggestion.confidence * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</p>
                        <p className="mt-1 text-xs text-vault-500">{suggestion.match_method === 'gtin' ? 'GTIN / EAN' : 'Namensabgleich'}</p>
                      </div>
                      <div className="flex gap-4 lg:justify-end">
                        <MutationButton id={suggestion.id} label="Freigeben" pendingLabel="Wird freigegeben …" action={approveSuggestion} tone="neutral" />
                        <MutationButton id={suggestion.id} label="Ablehnen" pendingLabel="Wird abgelehnt …" action={rejectSuggestion} />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="border-t border-vault-700 px-5 py-6 text-sm text-vault-300 sm:px-6">Keine offenen Vorschläge.</p>
              )}
            </div>
          </section>

          <section className="panel overflow-hidden" aria-labelledby="product-list">
            <div className="border-b border-vault-700 px-5 py-4">
              <h2 id="product-list" className="font-semibold">Aktive Produkte</h2>
            </div>
            {products.length ? (
              <div className="divide-y divide-vault-700/70">
                {products.map((product) => (
                  <article key={product.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold">
                        <Link href={`/dashboard/products/${product.id}`} className="hover:text-merchant-success">
                          {product.name}
                        </Link>
                      </h3>
                      <p className="mt-1 font-mono text-xs text-vault-500">{product.our_sku ?? 'Keine SKU'} · {formatPrice(product.our_price, product.our_currency)}</p>
                      <p className="mt-1 text-xs text-vault-500">
                        {variants.filter((variant) => variant.product_id === product.id).length} Variante(n)
                      </p>
                    </div>
                    <MutationButton id={product.id} label="Deaktivieren" pendingLabel="Wird deaktiviert …" action={deactivateProduct} />
                  </article>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-vault-300">Noch keine Produkte angelegt.</p>
            )}
          </section>

          <section className="panel overflow-hidden" aria-labelledby="mapping-list">
            <div className="border-b border-vault-700 px-5 py-4">
              <h2 id="mapping-list" className="font-semibold">Produkt-Zuordnungen</h2>
            </div>
            {mappings.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-vault-800/70 text-[10px] uppercase text-vault-500">
                    <tr>
                      <th className="px-5 py-4">Produkt</th>
                      <th className="px-4 py-4">Eigener Preis</th>
                      <th className="px-4 py-4">Mitbewerber</th>
                      <th className="px-4 py-4">Abrufplan</th>
                      <th className="px-4 py-4">Status</th>
                      <th className="px-4 py-4">Gefundener Preis</th>
                      <th className="px-4 py-4">Produkt-URL</th>
                      <th className="px-5 py-4 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((mapping) => {
                      const product = products.find((item) => item.id === mapping.product_id)
                      const latest = latestByMapping.get(mapping.id)
                      const frequency = mapping.competitors?.scrape_freq_h ?? 12
                      const lastSuccess = mapping.last_successful_scrape_at ?? latest?.scraped_at ?? null
                      const nextRun = lastSuccess
                        ? new Date(new Date(lastSuccess).getTime() + frequency * 60 * 60 * 1000).toISOString()
                        : null
                      return (
                        <tr key={mapping.id} className="border-t border-vault-700/70">
                          <td className="px-5 py-4 font-semibold">
                            {mapping.products?.name ?? 'Unbekannt'}
                            <span className="mt-1 block text-xs font-normal text-vault-500">{mapping.product_variants?.name ?? 'Standard'} · {mapping.product_variants?.sku ?? 'ohne SKU'}</span>
                          </td>
                          <td className="px-4 py-4 font-mono text-vault-300">{formatPrice(mapping.product_variants?.our_price ?? product?.our_price ?? null, mapping.product_variants?.currency ?? 'EUR')}</td>
                          <td className="px-4 py-4">{mapping.competitors?.shop_name ?? 'Unbekannt'}</td>
                          <td className="px-4 py-4 text-xs text-vault-300">
                            Alle {frequency} Std.
                            <span className="mt-1 block text-vault-500">
                              Nächster Lauf: {nextRun ? formatRelativeTime(nextRun) : 'sofort fällig'}
                            </span>
                            {latest?.scrape_ok === false && <span className="mt-1 block text-red-700">Fehlgeschlagen</span>}
                          </td>
                          <td className="px-4 py-4 text-xs">
                            <span className={`inline-flex rounded-full px-2 py-1 font-semibold ${
                              mapping.health_status === 'broken'
                                ? 'bg-red-50 text-red-700'
                                : mapping.health_status === 'degraded'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {mapping.health_status === 'broken' ? 'Defekt' : mapping.health_status === 'degraded' ? 'Degradiert' : 'Gesund'}
                            </span>
                            {mapping.last_failure_reason && (
                              <span className="mt-1 block max-w-48 truncate text-vault-500">{mapping.last_failure_reason}</span>
                            )}
                          </td>
                          <td className="px-4 py-4 font-mono text-vault-300">{formatPrice(latest?.competitor_price ?? null)}</td>
                          <td className="max-w-xs truncate px-4 py-4 font-mono text-xs text-vault-500">{mapping.competitor_url}</td>
                          <td className="space-y-2 px-5 py-4 text-right">
                            <ManualScrapeButton
                              action={runManualScrape}
                              competitorProductId={mapping.id}
                              label="Jetzt abrufen"
                              pendingLabel="Ruft ab …"
                              compact
                            />
                            <ExportButton competitorProductId={mapping.id} />
                            {mapping.health_status !== 'healthy' && (
                              <details className="text-left">
                                <summary className="cursor-pointer text-xs font-semibold text-merchant-success">Reparieren</summary>
                                <form action={repairSource} className="mt-3 space-y-2">
                                  <input type="hidden" name="id" value={mapping.id} />
                                  <label className="block">
                                    <span className="field-label">URL</span>
                                    <input className="field min-w-64" name="competitor_url" defaultValue={mapping.competitor_url} />
                                  </label>
                                  <label className="block">
                                    <span className="field-label">Preis-Selektor</span>
                                    <input className="field min-w-64" name="selector_price" defaultValue={mapping.selector_price ?? ''} />
                                  </label>
                                  <button className="button-secondary w-full">Testen</button>
                                </form>
                              </details>
                            )}
                            <MutationButton id={mapping.id} label="Entfernen" pendingLabel="Wird entfernt …" action={deleteMapping} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-6 text-sm text-vault-300">Noch keine Produkt-Zuordnungen angelegt.</p>
            )}
          </section>
        </div>
      )}
    </>
  )
}
