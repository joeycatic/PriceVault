import { revalidatePath } from 'next/cache'

import { ManualScrapeButton } from '@/components/ui/ManualScrapeButton'
import { MutationButton } from '@/components/ui/MutationButton'
import { MappingForm, ProductForm, ProductImportForm } from '@/components/ui/ProductForms'
import { runManualScrape } from '@/app/dashboard/scrape-actions'
import { ExportButton } from '@/app/dashboard/products/[id]/ExportButton'
import { currentTenant } from '@/lib/backend'
import { parsePriceInput } from '@/lib/priceInput'
import { planLimit } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import type { Competitor, CompetitorProduct, LatestPrice, Product } from '@/lib/types'
import { formatPrice, formatRelativeTime } from '@/lib/utils'

type MappingRow = CompetitorProduct & {
  products: { name: string } | null
  competitors: { shop_name: string } | null
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

  const [productResult, competitorResult, mappingResult, latestResult] = tenant
    ? await Promise.all([
        supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('active', true).order('name'),
        supabase.from('competitors').select('*').eq('tenant_id', tenant.id).eq('active', true).order('shop_name'),
        supabase
          .from('competitor_products')
          .select('*, products(name), competitors(shop_name)')
          .eq('tenant_id', tenant.id)
          .eq('active', true)
          .order('created_at'),
        supabase.from('v_latest_prices').select('*').eq('tenant_id', tenant.id),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const products = (productResult.data ?? []) as Product[]
  const competitors = (competitorResult.data ?? []) as Competitor[]
  const mappings = (mappingResult.data ?? []) as MappingRow[]
  const latestRows = (latestResult.data ?? []) as LatestPrice[]
  const latestByMapping = new Map(latestRows.map((row) => [row.competitor_product_id, row]))
  const productLimit = planLimit(tenant?.plan).products

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
    const { error } = await client.from('products').insert({
      tenant_id: tenant.id,
      name,
      our_sku: String(formData.get('our_sku') || '') || null,
      our_price: price,
      our_currency: 'EUR',
    })
    if (error) return { ok: false, message: 'Das Produkt konnte nicht angelegt werden.' }
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

    const { error } = await client.from('products').insert(rows.map((row) => ({ ...row, tenant_id: tenant.id })))
    if (error) return { ok: false, message: 'Die Produkte konnten nicht importiert werden.' }

    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard')
    return { ok: true, message: `${rows.length} Produkt(e) importiert.` }
  }

  async function createMapping(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const productId = String(formData.get('product_id') ?? '')
    const competitorId = String(formData.get('competitor_id') ?? '')
    const competitorUrl = String(formData.get('competitor_url') ?? '').trim()
    if (!productId || !competitorId || !competitorUrl) {
      return { ok: false, message: 'Produkt, Mitbewerber und URL sind erforderlich.' }
    }
    const { error } = await client.from('competitor_products').insert({
      tenant_id: tenant.id,
      product_id: productId,
      competitor_id: competitorId,
      competitor_url: competitorUrl,
      competitor_sku: String(formData.get('competitor_sku') || '') || null,
      selector_price: String(formData.get('selector_price') || '') || null,
    })
    if (error) {
      return { ok: false, message: 'Die Zuordnung konnte nicht gespeichert werden. Prüfe, ob sie bereits existiert.' }
    }
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard')
    return { ok: true, message: 'Preisquelle wurde zugeordnet.' }
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
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Katalog / Preisquellen</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Produkte</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
          Pflege deine eigenen Produkte, importiere größere Listen und verbinde sie mit den Produktseiten deiner Mitbewerber.
          Dein Unternehmensprofil liegt jetzt im eigenen Bereich.
        </p>
      </header>

      {!tenant ? (
        <div className="panel p-6 text-sm text-amber-100">Für dieses Konto wurde noch kein Mandant eingerichtet.</div>
      ) : (
        <div className="space-y-6">
          <section className="panel p-5 sm:p-6" aria-labelledby="scrape-clarity">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div>
                <p className="eyebrow">Preisabruf</p>
                <h2 id="scrape-clarity" className="mt-2 text-xl font-semibold">Wann werden Preise gescraped?</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-vault-300">
                  PriceVault ruft aktive Preisquellen automatisch alle 12 Stunden ab. Nach dem Anlegen oder Ändern einer Quelle kannst du sofort einen manuellen Abruf starten.
                </p>
              </div>
              <ManualScrapeButton action={runManualScrape} disabled={!mappings.length} />
            </div>
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-2">
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
          </div>

          {productLimit !== null && (
            <p className="text-sm text-vault-400">
              Dein Plan nutzt {products.length} von {productLimit} aktiven Produkten.
            </p>
          )}

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <section className="panel p-5 sm:p-6" aria-labelledby="new-mapping">
              <p className="eyebrow">Preisquelle</p>
              <h2 id="new-mapping" className="mb-5 mt-2 text-xl font-semibold">Zuordnung anlegen</h2>
              <MappingForm action={createMapping} products={products} competitors={competitors} />
            </section>
          </div>

          <section className="panel overflow-hidden" aria-labelledby="product-list">
            <div className="border-b border-vault-700 px-5 py-4">
              <h2 id="product-list" className="font-semibold">Aktive Produkte</h2>
            </div>
            {products.length ? (
              <div className="divide-y divide-vault-700/70">
                {products.map((product) => (
                  <article key={product.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{product.name}</h3>
                      <p className="mt-1 font-mono text-xs text-vault-500">{product.our_sku ?? 'Keine SKU'} · {formatPrice(product.our_price, product.our_currency)}</p>
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
                  <thead className="bg-vault-800/70 text-[10px] uppercase tracking-[0.14em] text-vault-500">
                    <tr>
                      <th className="px-5 py-4">Produkt</th>
                      <th className="px-4 py-4">Eigener Preis</th>
                      <th className="px-4 py-4">Mitbewerber</th>
                      <th className="px-4 py-4">Letzter Abruf</th>
                      <th className="px-4 py-4">Gefundener Preis</th>
                      <th className="px-4 py-4">Produkt-URL</th>
                      <th className="px-5 py-4 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((mapping) => {
                      const product = products.find((item) => item.id === mapping.product_id)
                      const latest = latestByMapping.get(mapping.id)
                      return (
                        <tr key={mapping.id} className="border-t border-vault-700/70">
                          <td className="px-5 py-4 font-semibold">{mapping.products?.name ?? 'Unbekannt'}</td>
                          <td className="px-4 py-4 font-mono text-vault-300">{formatPrice(product?.our_price ?? null)}</td>
                          <td className="px-4 py-4">{mapping.competitors?.shop_name ?? 'Unbekannt'}</td>
                          <td className="px-4 py-4 text-xs text-vault-300">
                            {latest?.scraped_at ? formatRelativeTime(latest.scraped_at) : 'Noch nie'}
                            {latest?.scrape_ok === false && <span className="mt-1 block text-red-300">Fehlgeschlagen</span>}
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
