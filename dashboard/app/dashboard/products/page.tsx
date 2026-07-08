import { revalidatePath } from 'next/cache'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  ListChecks,
  PackagePlus,
  Radar,
  Search,
  Tags,
  Store,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import { ManualScrapeButton } from '@/components/ui/ManualScrapeButton'
import { PageHeader } from '@/components/ui/MerchantUI'
import { MutationButton } from '@/components/ui/MutationButton'
import { MappingForm, MatchSuggestionForm, ProductForm, ProductImportForm, PublicCatalogImportForm, VariantForm, type CatalogCandidate } from '@/components/ui/ProductForms'
import { runManualScrape } from '@/app/dashboard/scrape-actions'
import { ExportButton } from '@/app/dashboard/products/[id]/ExportButton'
import { backendFetch, currentTenant } from '@/lib/backend'
import { catalogDuplicateReason, createDuplicateIndex } from '@/lib/catalog-duplicates'
import { parsePriceInput } from '@/lib/priceInput'
import { minimumScrapeFrequency, planLimit } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import type { Competitor, CompetitorProduct, LatestPrice, MatchSuggestion, Product, ProductVariant, StoreRecommendation } from '@/lib/types'
import { formatPrice, formatRelativeTime } from '@/lib/utils'

type MappingRow = CompetitorProduct & {
  products: { name: string } | null
  product_variants: { name: string; sku: string | null; our_price: number | null; currency: string } | null
  competitors: { shop_name: string; scrape_freq_h: number } | null
}

type SuggestionGroup = {
  key: string
  productName: string
  variantName: string
  variantSku: string | null
  variantGtin: string | null
  suggestions: MatchSuggestion[]
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

function hostFromUrl(value: string) {
  try {
    return new URL(value).host.replace(/^www\./, '')
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  }
}

function ProductsPanelTitle({
  eyebrow,
  title,
  description,
  icon: Icon,
  titleId,
}: {
  eyebrow: string
  title: string
  description?: string
  icon: LucideIcon
  titleId?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-vault-700 bg-vault-800 text-vault-100 shadow-sm">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-[-0.01em] text-vault-100">{title}</h2>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-vault-300">{description}</p>}
      </div>
    </div>
  )
}

function MatchingMethodHeader({
  icon: Icon,
  title,
  description,
  accent,
}: {
  icon: LucideIcon
  title: string
  description: string
  accent: string
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accent}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h3 className="font-semibold text-vault-100">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-vault-500">{description}</p>
      </div>
    </div>
  )
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
  const canManageMatching = Boolean(tenant && ['owner', 'admin'].includes(tenant.membership_role ?? 'owner'))
  const latestByMapping = new Map(latestRows.map((row) => [row.competitor_product_id, row]))
  const productLimit = planLimit(tenant?.plan).products
  const competitorLimit = planLimit(tenant?.plan).competitors
  const unhealthyMappings = mappings.filter((mapping) => ['degraded', 'broken'].includes(mapping.health_status))
  const healthyMappings = mappings.filter((mapping) => mapping.health_status === 'healthy')
  let storeRecommendations: StoreRecommendation[] = []
  let recommendationsUnavailable = false
  if (tenant && canManageMatching) {
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
  const competitorHosts = new Set(competitors.map((competitor) => hostFromUrl(competitor.base_url)))
  const visibleRecommendations = storeRecommendations
    .filter((recommendation) => !competitorHosts.has(hostFromUrl(recommendation.base_url)))
    .slice(0, 4)
  const suggestionGroups = Array.from(
    suggestions.reduce((groups, suggestion) => {
      const key = `${suggestion.product_id}:${suggestion.variant_id}`
      const current = groups.get(key) ?? {
        key,
        productName: suggestion.products?.name ?? 'Unbekanntes Produkt',
        variantName: suggestion.product_variants?.name ?? 'Standard',
        variantSku: suggestion.product_variants?.sku ?? null,
        variantGtin: suggestion.product_variants?.gtin ?? null,
        suggestions: [],
      }
      current.suggestions.push(suggestion)
      groups.set(key, current)
      return groups
    }, new Map<string, SuggestionGroup>()).values(),
  )

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

  async function discoverCatalog(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.', products: [] }
    const maxProducts = Number(formData.get('max_products') ?? 50)
    if (!Number.isInteger(maxProducts) || maxProducts < 1 || maxProducts > 250) {
      return { ok: false, message: 'Wähle einen Bereich zwischen 1 und 250 Produkten.', products: [] }
    }
    try {
      const response = await backendFetch('/products/discover', tenant.id, {
        method: 'POST',
        body: JSON.stringify({
          base_url: String(formData.get('base_url') ?? '').trim(),
          max_products: maxProducts,
        }),
        cache: 'no-store',
      })
      const payload = await response.json()
      if (!response.ok) return { ok: false, message: payload.detail ?? 'Der Shop konnte nicht gelesen werden.', products: [] }
      const found = (payload.products ?? []) as CatalogCandidate[]
      const client = await createClient()
      const [existingProductResult, existingVariantResult] = await Promise.all([
        client.from('products').select('name,our_sku').eq('tenant_id', tenant.id).eq('active', true),
        client.from('product_variants').select('sku,gtin,external_refs').eq('tenant_id', tenant.id).eq('active', true),
      ])
      if (existingProductResult.error || existingVariantResult.error) {
        return { ok: false, message: 'Die Duplikatprüfung konnte nicht ausgeführt werden.', products: [] }
      }
      const duplicateIndex = createDuplicateIndex(
        (existingProductResult.data ?? []) as Array<{ name: string; our_sku: string | null }>,
        (existingVariantResult.data ?? []) as Array<{ sku: string | null; gtin: string | null; external_refs: Record<string, unknown> | null }>,
      )
      const marked = found.map((item) => {
        const reason = catalogDuplicateReason(item, duplicateIndex)
        return { ...item, duplicate: Boolean(reason), duplicate_reason: reason }
      })
      const duplicateCount = marked.filter((item) => item.duplicate).length
      return {
        ok: true,
        message: marked.length ? `${marked.length} Produkt(e) erkannt.` : 'In diesem Shop wurden keine strukturierten Produktseiten erkannt.',
        products: marked,
        duplicateCount,
      }
    } catch {
      return { ok: false, message: 'Der Katalogdienst ist nicht erreichbar.', products: [] }
    }
  }

  async function importDiscoveredProducts(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    let candidates: CatalogCandidate[]
    try {
      const parsed = JSON.parse(String(formData.get('products') ?? '[]'))
      candidates = Array.isArray(parsed) ? parsed : []
    } catch {
      return { ok: false, message: 'Die Produktauswahl ist ungültig.' }
    }
    const unique = new Map<string, CatalogCandidate>()
    for (const item of candidates.slice(0, 250)) {
      const name = typeof item?.name === 'string' ? item.name.trim() : ''
      const url = typeof item?.url === 'string' ? item.url : ''
      if (name && url) unique.set(url, { ...item, name, url })
    }
    const selected = Array.from(unique.values())
    if (!selected.length) return { ok: false, message: 'Wähle mindestens ein Produkt aus.' }

    const client = await createClient()
    const [existingProductResult, existingVariantResult] = await Promise.all([
      client.from('products').select('name,our_sku').eq('tenant_id', tenant.id).eq('active', true),
      client.from('product_variants').select('sku,gtin,external_refs').eq('tenant_id', tenant.id).eq('active', true),
    ])
    if (existingProductResult.error || existingVariantResult.error) {
      return { ok: false, message: 'Die Duplikatprüfung konnte nicht ausgeführt werden.' }
    }
    const duplicateIndex = createDuplicateIndex(
      (existingProductResult.data ?? []) as Array<{ name: string; our_sku: string | null }>,
      (existingVariantResult.data ?? []) as Array<{ sku: string | null; gtin: string | null; external_refs: Record<string, unknown> | null }>,
    )
    const importable = selected.filter((item) => !catalogDuplicateReason(item, duplicateIndex))
    const skippedDuplicates = selected.length - importable.length
    if (!importable.length) {
      return { ok: true, message: `Keine Produkte importiert: ${skippedDuplicates} bereits vorhanden.` }
    }
    const limit = planLimit(tenant.plan).products
    if (limit !== null) {
      const { count, error: countError } = await client.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('active', true)
      if (countError) return { ok: false, message: 'Das Produktlimit konnte nicht geprüft werden.' }
      if ((count ?? 0) + importable.length > limit) {
        return { ok: false, message: `Dein Plan erlaubt maximal ${limit} aktive Produkte. Du kannst noch ${Math.max(0, limit - (count ?? 0))} importieren.` }
      }
    }
    const rows = importable.map((item) => ({
      tenant_id: tenant.id,
      name: item.name,
      our_sku: item.sku || null,
      our_price: item.price !== null && Number.isFinite(Number(item.price)) ? Number(item.price) : null,
      our_currency: /^[A-Z]{3}$/.test(item.currency) ? item.currency : 'EUR',
    }))
    const { data: inserted, error } = await client.from('products').insert(rows).select('id,our_sku,our_price,our_currency')
    if (error || !inserted) return { ok: false, message: 'Die ausgewählten Produkte konnten nicht importiert werden. Prüfe doppelte SKUs.' }
    const { error: variantError } = await client.from('product_variants').insert(inserted.map((product, index) => ({
      tenant_id: tenant.id,
      product_id: product.id,
      name: 'Standard',
      sku: product.our_sku,
      gtin: importable[index]?.gtin || null,
      our_price: product.our_price,
      currency: product.our_currency,
      is_default: true,
      external_refs: { catalog_url: importable[index]?.url, discovery_source: importable[index]?.source },
    })))
    if (variantError) {
      await client.from('products').delete().eq('tenant_id', tenant.id).in('id', inserted.map((product) => product.id))
      return { ok: false, message: 'Der Import wurde wegen ungültiger SKU- oder GTIN-Daten zurückgesetzt.' }
    }
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard')
    return { ok: true, message: `${inserted.length} Produkt(e) importiert${skippedDuplicates ? ` · ${skippedDuplicates} Duplikat(e) übersprungen` : ''}.` }
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
      .select('id,name,currency')
      .eq('tenant_id', tenant.id)
      .eq('product_id', productId)
      .eq('id', variantId)
      .maybeSingle()
    if (!variant) return { ok: false, message: 'Die Variante gehört nicht zum ausgewählten Produkt.' }
    const response = await backendFetch(`/products/${productId}/mappings`, tenant.id, {
      method: 'POST',
      body: JSON.stringify({
        variant_id: variantId,
        competitor_id: competitorId,
        competitor_url: competitorUrl,
        competitor_sku: String(formData.get('competitor_sku') || '') || null,
        selector_price: String(formData.get('selector_price') || '') || null,
        expected_currency: variant.currency,
        expected_variant: variant.name,
        customer_authorized: formData.get('customer_authorized') === 'on',
      }),
    })
    const data = await response.json()
    if (!response.ok) return { ok: false, message: data.detail ?? 'Die Zuordnung konnte nicht gespeichert werden.' }
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
    } catch (error) {
      console.error('[products/matcher] suggestion generation failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { ok: false, message: error instanceof Error && error.name === 'TimeoutError' ? 'Die Produktsuche hat das Zeitlimit überschritten.' : 'Die Produktsuche konnte nicht abgeschlossen werden.' }
    }
  }

  async function approveRecommendedCompetitor(formData: FormData) {
    'use server'
    if (!tenant) return
    const minimum = minimumScrapeFrequency(tenant.plan)
    const frequency = Math.min(168, Math.max(minimum, tenant.default_scrape_freq_h ?? minimum))
    const shopName = String(formData.get('shop_name') ?? '').trim()
    const baseUrl = String(formData.get('base_url') ?? '').trim()
    if (!shopName || !baseUrl) return
    try {
      const response = await backendFetch('/competitors', tenant.id, {
        method: 'POST',
        body: JSON.stringify({
          shop_name: shopName,
          base_url: baseUrl,
          scrape_freq_h: frequency,
          notes: 'Aus Shop-Empfehlung übernommen.',
        }),
      })
      if (!response.ok) return
      revalidatePath('/dashboard/products')
      revalidatePath('/dashboard/competitors')
      revalidatePath('/dashboard')
    } catch {
      return
    }
  }

  async function generateCatalogSuggestions(_formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    try {
      const response = await backendFetch('/match/suggestions/generate-catalog', tenant.id, {
        method: 'POST',
        body: JSON.stringify({ limit: 5 }),
        signal: AbortSignal.timeout(180_000),
      })
      const payload = await response.json()
      if (!response.ok) return { ok: false, message: payload.detail ?? 'Das automatische Matching ist fehlgeschlagen.' }
      revalidatePath('/dashboard/products')
      return {
        ok: true,
        message: Number(payload.suggestions) > 0
          ? `${Number(payload.suggestions)} Vorschlag/Vorschläge vorbereitet.`
          : 'Keine neuen Vorschläge gefunden.',
      }
    } catch (error) {
      console.error('[products/matcher] catalog generation failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { ok: false, message: error instanceof Error && error.name === 'TimeoutError' ? 'Das automatische Matching hat das Zeitlimit überschritten.' : 'Das automatische Matching konnte nicht abgeschlossen werden.' }
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
    } catch (error) {
      console.error('[products/matcher] suggestion review failed', {
        suggestionId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return { ok: false, message: 'Der Vorschlag konnte nicht verarbeitet werden.' }
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
          <section className="panel overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(32,132,90,0.10),transparent_34%),linear-gradient(135deg,#ffffff_0%,#ffffff_58%,#f7f7f7_100%)]" aria-labelledby="product-overview">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="p-5 sm:p-6">
                <ProductsPanelTitle
                  eyebrow="Arbeitsbereich"
                  title="Produkte sauber erfassen, Varianten pflegen und Preisquellen verbinden"
                  description="Starte mit deinem Katalog, ergänze Varianten und verknüpfe anschließend jede Variante mit einer eindeutigen Mitbewerber-URL oder einem geprüften Vorschlag."
                  icon={Boxes}
                  titleId="product-overview"
                />
                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  {[
                    { label: 'Produkte', value: products.length, icon: Tags, tone: 'text-vault-100 bg-white' },
                    { label: 'Varianten', value: variants.length, icon: Boxes, tone: 'text-vault-100 bg-white' },
                    { label: 'Preisquellen', value: mappings.length, icon: Link2, tone: 'text-merchant-success bg-emerald-50' },
                    { label: 'Offene Vorschläge', value: suggestions.length, icon: ListChecks, tone: suggestions.length ? 'text-amber-700 bg-amber-50' : 'text-vault-500 bg-white' },
                  ].map((item, index) => {
                    const Icon = item.icon
                    return (
                      <div key={item.label} className="product-tab-reveal rounded-xl border border-vault-700 bg-white/85 p-4 shadow-sm" style={{ animationDelay: `${index * 70}ms` }}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-vault-500">{item.label}</span>
                          <span className={`grid h-8 w-8 place-items-center rounded-lg ${item.tone}`}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                        </div>
                        <p className="mt-4 font-mono text-2xl font-semibold text-vault-100">{item.value}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="border-t border-vault-700 bg-white/70 p-5 sm:p-6 lg:border-l lg:border-t-0">
                <div className="flex h-full flex-col justify-between gap-5">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-vault-100">
                      <Clock3 className="h-4 w-4 text-merchant-success" aria-hidden="true" />
                      Preisabruf
                    </div>
                    <p className="mt-3 text-sm leading-6 text-vault-300">
                      Jede aktive Preisquelle läuft nach ihrem Mitbewerber-Intervall. Manuelle Abrufe starten sofort und ändern nicht die Zuordnung.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{healthyMappings.length} gesund</span>
                      {unhealthyMappings.length > 0 && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{unhealthyMappings.length} prüfen</span>
                      )}
                    </div>
                  </div>
                  <ManualScrapeButton action={runManualScrape} disabled={!mappings.length} />
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-4" aria-label="Produkt-Workflow">
            {[
              { step: '01', title: 'Katalog importieren', description: 'Shop scannen oder CSV nutzen', icon: Store },
              { step: '02', title: 'Produkte prüfen', description: 'SKU und Preise ergänzen', icon: CheckCircle2 },
              { step: '03', title: 'Varianten pflegen', description: 'GTIN/EAN verbessert Treffer', icon: PackagePlus },
              { step: '04', title: 'Quellen matchen', description: 'URL oder Vorschlag freigeben', icon: Radar },
            ].map((item, index) => {
              const Icon = item.icon
              return (
                <article key={item.step} className="product-tab-reveal group rounded-xl border border-vault-700 bg-white p-4 shadow-panel transition hover:-translate-y-0.5 hover:border-vault-500 hover:shadow-md" style={{ animationDelay: `${index * 80}ms` }}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-vault-500">{item.step}</span>
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-vault-800 text-vault-300 transition group-hover:bg-emerald-50 group-hover:text-merchant-success">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                  <h2 className="mt-4 text-sm font-semibold text-vault-100">{item.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-vault-500">{item.description}</p>
                </article>
              )
            })}
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="catalog-discovery">
            <ProductsPanelTitle
              eyebrow="Importoption 01"
              title="Shop-Katalog automatisch erkennen"
              description="Füge nur die Basis-URL deines Shops ein. PriceVault erkennt öffentliche Produktseiten; du bestimmst den Suchbereich und bestätigst die Produkte vor dem Import."
              icon={Search}
              titleId="catalog-discovery"
            />
            <div className="mt-6">
              <PublicCatalogImportForm discoverAction={discoverCatalog} importAction={importDiscoveredProducts} />
            </div>
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-3">
            <section className="panel p-5 transition hover:-translate-y-0.5 hover:shadow-md sm:p-6" aria-labelledby="new-product">
              <ProductsPanelTitle
                eyebrow="Importoption 02"
                title="Ein Produkt manuell anlegen"
                icon={PackagePlus}
                titleId="new-product"
              />
              <div className="mt-5">
                <ProductForm action={createProduct} />
              </div>
            </section>

            <section className="panel p-5 transition hover:-translate-y-0.5 hover:shadow-md sm:p-6" aria-labelledby="bulk-import">
              <ProductsPanelTitle
                eyebrow="Importoption 03 / 04"
                title="Produkte per CSV importieren"
                icon={FileSpreadsheet}
                titleId="bulk-import"
              />
              <div className="mt-5">
                <ProductImportForm action={importProducts} />
              </div>
            </section>
            <section className="panel p-5 transition hover:-translate-y-0.5 hover:shadow-md sm:p-6" aria-labelledby="new-variant">
              <ProductsPanelTitle
                eyebrow="Varianten"
                title="Variante ergänzen"
                icon={Boxes}
                titleId="new-variant"
              />
              <div className="mt-5">
                <VariantForm action={createVariant} products={products} />
              </div>
            </section>
          </div>

          {productLimit !== null && (
            <p className="rounded-xl border border-vault-700 bg-white px-4 py-3 text-sm text-vault-400">
              Dein Plan nutzt {products.length} von {productLimit} aktiven Produkten.
            </p>
          )}

          {unhealthyMappings.length > 0 && (
            <section className="panel border-l-4 border-l-amber-400 bg-amber-50/40 p-5" aria-labelledby="source-health">
              <div className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-200 bg-white text-amber-700">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="source-health" className="text-base font-semibold">Preisquellen benötigen Aufmerksamkeit</h2>
                  <p className="mt-2 text-sm leading-6 text-vault-300">
                    {unhealthyMappings.length} Quelle(n) sind degradiert oder defekt. Repariere URL oder Preis-Selektor und starte danach einen Testabruf.
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="panel overflow-hidden" aria-labelledby="matching-workspace">
            <div className="border-b border-vault-700 bg-[linear-gradient(90deg,#ffffff_0%,#f7f7f7_100%)] px-5 py-5 sm:px-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <ProductsPanelTitle
                  eyebrow="Produkt-Matching"
                  title="Produkte zuordnen"
                  description="Ordne jede interne Variante einer konkreten Mitbewerber-Produktseite zu. Manuelle URLs sind sofort nutzbar; automatische Vorschläge bleiben bis zur Freigabe in der Warteschlange."
                  icon={Workflow}
                  titleId="matching-workspace"
                />
                <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-64">
                  <div className="rounded-xl border border-vault-700 bg-white px-3 py-2">
                    <span className="block text-vault-500">Aktive Zuordnungen</span>
                    <span className="mt-1 block font-mono text-lg font-semibold text-vault-100">{mappings.length}</span>
                  </div>
                  <div className="rounded-xl border border-vault-700 bg-white px-3 py-2">
                    <span className="block text-vault-500">Zu prüfen</span>
                    <span className="mt-1 block font-mono text-lg font-semibold text-amber-700">{suggestions.length}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-b border-vault-700 bg-white px-5 py-5 sm:px-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
                <div>
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-merchant-success">
                      <WandSparkles className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="eyebrow">Bulk-Workflow</p>
                      <h3 className="mt-1 font-semibold text-vault-100">Auto-Matching starten</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-vault-300">
                        Gib zuerst passende Shops frei. Danach sucht PriceVault für alle aktiven Varianten nach Produktseiten bei freigegebenen Mitbewerbern und legt nur prüfpflichtige Vorschläge an.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-vault-700 bg-vault-950 p-4">
                      <p className="text-xs font-semibold text-vault-500">01 Shops freigeben</p>
                      <p className="mt-2 text-sm font-semibold text-vault-100">{competitors.length ? `${competitors.length} Mitbewerber aktiv` : 'Keine Mitbewerber freigegeben'}</p>
                    </div>
                    <div className="rounded-xl border border-vault-700 bg-vault-950 p-4">
                      <p className="text-xs font-semibold text-vault-500">02 Varianten durchsuchen</p>
                      <p className="mt-2 text-sm font-semibold text-vault-100">{variants.length} aktive Variante(n)</p>
                    </div>
                    <div className="rounded-xl border border-vault-700 bg-vault-950 p-4">
                      <p className="text-xs font-semibold text-vault-500">03 Vorschläge prüfen</p>
                      <p className="mt-2 text-sm font-semibold text-vault-100">{suggestions.length} offen</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-vault-700 bg-vault-950 p-4">
                  <MutationButton
                    id="catalog"
                    label="Auto-Matching starten"
                    pendingLabel="Matching läuft …"
                    action={generateCatalogSuggestions}
                    tone="neutral"
                  />
                  <p className="mt-3 text-xs leading-5 text-vault-500">
                    {competitors.length ? 'Sucht nur bei aktiven Mitbewerbern und überspringt bestehende Zuordnungen.' : 'Keine Mitbewerber freigegeben.'}
                  </p>
                </div>
              </div>
              {canManageMatching && (
                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-vault-100">Empfohlene Shops</h4>
                    {competitorLimit !== null && (
                      <span className="rounded-full border border-vault-700 bg-white px-3 py-1 text-xs font-semibold text-vault-500">
                        {competitors.length}/{competitorLimit} aktiv
                      </span>
                    )}
                  </div>
                  {visibleRecommendations.length ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {visibleRecommendations.map((recommendation) => (
                        <article key={recommendation.host} className="rounded-xl border border-vault-700 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h5 className="truncate font-semibold text-vault-100">{recommendation.shop_name}</h5>
                              <p className="mt-1 truncate font-mono text-xs text-vault-500">{recommendation.host}</p>
                            </div>
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                              {Math.round(recommendation.confidence * 100)}%
                            </span>
                          </div>
                          <p className="mt-3 line-clamp-2 text-xs leading-5 text-vault-500">{recommendation.reasons.join(' · ')}</p>
                          <div className="mt-4 flex items-center justify-between gap-2 border-t border-vault-700 pt-3">
                            <a className="inline-flex items-center gap-1 text-xs font-semibold text-vault-500 hover:text-merchant-success" href={recommendation.base_url} target="_blank" rel="noreferrer">
                              Prüfen
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                            <form action={approveRecommendedCompetitor}>
                              <input type="hidden" name="shop_name" value={recommendation.shop_name} />
                              <input type="hidden" name="base_url" value={recommendation.base_url} />
                              <button className="button-primary min-h-9 px-3 py-2 text-xs">
                                Freigeben
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </form>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-vault-700 bg-vault-950 px-4 py-5 text-sm text-vault-500">
                      {recommendationsUnavailable ? 'Shop-Empfehlungen sind gerade nicht verfügbar.' : 'Keine neuen Shop-Empfehlungen.'}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="grid items-start gap-4 bg-vault-800/55 p-4 lg:grid-cols-2 sm:p-5">
              <div className="rounded-2xl border border-vault-700 bg-white p-5 shadow-sm sm:p-6">
                <MatchingMethodHeader
                  icon={Link2}
                  title="Mit URL manuell zuordnen"
                  description="Beste Option, wenn du die Zielseite bereits kennst."
                  accent="border border-emerald-200 bg-emerald-50 text-merchant-success"
                />
                <MappingForm action={createMapping} products={products} variants={variants} competitors={competitors} />
              </div>
              <div className="rounded-2xl border border-vault-700 bg-white p-5 shadow-sm sm:p-6">
                <MatchingMethodHeader
                  icon={Bot}
                  title="Automatische Vorschläge"
                  description="Nutzt GTIN/EAN oder Produktname, bleibt aber prüfpflichtig."
                  accent="border border-vault-700 bg-vault-800 text-vault-100"
                />
                <MatchSuggestionForm action={generateSuggestions} products={products} variants={variants} competitors={competitors} />
              </div>
            </div>
            <div className="border-t border-vault-700 bg-white">
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-vault-800 text-vault-300">
                    <ListChecks className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-semibold">Freigabewarteschlange</h3>
                    <p className="mt-1 text-xs text-vault-500">Prüfe Trefferqualität, bevor PriceVault daraus eine aktive Preisquelle erstellt.</p>
                  </div>
                </div>
                <span className="w-fit rounded-full border border-vault-700 bg-vault-800 px-3 py-1 font-mono text-xs text-vault-500">{suggestions.length} offen</span>
              </div>
              {suggestionGroups.length ? (
                <div className="divide-y divide-vault-700/70 border-t border-vault-700">
                  {suggestionGroups.map((group) => (
                    <section key={group.key} className="p-5 sm:px-6" aria-label={`${group.productName} ${group.variantName}`}>
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="font-semibold text-vault-100">{group.productName} · {group.variantName}</h4>
                          <p className="mt-1 font-mono text-xs text-vault-500">
                            {group.variantSku ?? 'ohne SKU'}{group.variantGtin ? ` · GTIN ${group.variantGtin}` : ''}
                          </p>
                        </div>
                        <span className="w-fit rounded-full border border-vault-700 bg-vault-950 px-3 py-1 text-xs font-semibold text-vault-500">
                          {group.suggestions.length} Treffer
                        </span>
                      </div>
                      <div className="grid gap-3">
                        {group.suggestions.map((suggestion) => (
                          <article key={suggestion.id} className="grid gap-4 rounded-xl border border-vault-700 bg-white p-4 transition hover:bg-vault-950/70 lg:grid-cols-[minmax(0,1fr)_150px_auto] lg:items-center">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-vault-500">{suggestion.competitors?.shop_name ?? 'Mitbewerber'}</p>
                              <p className="mt-1 text-sm font-semibold text-vault-100">{suggestion.candidate_title}</p>
                              <a className="mt-1 block truncate font-mono text-xs text-merchant-success hover:underline" href={suggestion.candidate_url} target="_blank" rel="noreferrer">
                                {suggestion.candidate_url}
                              </a>
                            </div>
                            <div className="rounded-xl border border-vault-700 bg-vault-950 px-3 py-2">
                              <p className="font-mono text-sm font-semibold text-vault-100">{Number(suggestion.confidence * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</p>
                              <p className="mt-1 text-xs text-vault-500">{suggestion.match_method === 'gtin' ? 'GTIN / EAN' : 'Namensabgleich'}</p>
                            </div>
                            <div className="flex flex-wrap gap-3 lg:justify-end">
                              <MutationButton id={suggestion.id} label="Freigeben" pendingLabel="Wird freigegeben …" action={approveSuggestion} tone="neutral" icon="approve" iconOnly />
                              <MutationButton id={suggestion.id} label="Ablehnen" pendingLabel="Wird abgelehnt …" action={rejectSuggestion} icon="reject" iconOnly />
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="border-t border-vault-700 px-5 py-6 text-sm text-vault-300 sm:px-6">Keine offenen Vorschläge</p>
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
                    <MutationButton id={product.id} label="Deaktivieren" pendingLabel="Wird deaktiviert …" action={deactivateProduct} icon="trash" iconOnly />
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
