import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/ui/MerchantUI'
import { PriceTrendChart } from '@/components/ui/PriceTrendChart'
import { backendFetch, currentTenant } from '@/lib/backend'
import { hasPlan } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import type { CompetitorProduct, PriceSnapshot, Product, ProductVariant } from '@/lib/types'
import { formatPrice, formatRelativeTime } from '@/lib/utils'

type MappingRow = CompetitorProduct & {
  competitors: { shop_name: string } | null
  product_variants: { name: string; sku: string | null } | null
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenant = await currentTenant()
  if (!tenant) notFound()

  async function updateMapPrice(formData: FormData) {
    'use server'
    const activeTenant = await currentTenant()
    if (!activeTenant) return
    const variantId = String(formData.get('variant_id') ?? '')
    const mapRaw = String(formData.get('map_price') ?? '').trim().replace(',', '.')
    await backendFetch(`/products/${id}/variants/${variantId}`, activeTenant.id, {
      method: 'PATCH',
      body: JSON.stringify({ map_price: mapRaw ? Number(mapRaw) : null }),
    })
    revalidatePath(`/dashboard/products/${id}`)
  }

  const supabase = await createClient()
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('id', id)
    .maybeSingle()
  if (!product) notFound()

  const { data: variants } = await supabase
    .from('product_variants')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('product_id', id)
    .eq('active', true)
    .order('is_default', { ascending: false })
    .order('name')

  const { data: mappings } = await supabase
    .from('competitor_products')
    .select('*, product_variants(name,sku), competitors(shop_name)')
    .eq('tenant_id', tenant.id)
    .eq('product_id', id)
    .eq('active', true)
    .order('created_at')

  const mappingRows = (mappings ?? []) as MappingRow[]
  const mappingIds = mappingRows.map((mapping) => mapping.id)
  const { data: snapshots } = mappingIds.length
    ? await supabase
      .from('price_snapshots')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('competitor_product_id', mappingIds)
      .order('scraped_at', { ascending: true })
      .limit(500)
    : { data: [] }

  const typedProduct = product as Product
  const typedVariants = (variants ?? []) as ProductVariant[]
  const typedSnapshots = (snapshots ?? []) as PriceSnapshot[]
  const growthFeaturesEnabled = hasPlan(tenant.plan, 'pro')
  const { data: insightData } = await supabase
    .from('product_insights')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('product_id', id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const insight = insightData as null | {
    commentary: string
    corridor_min: number
    corridor_max: number
    corridor_reason: string
    model: string
    generated_at: string
  }
  const latestByMapping = new Map<string, PriceSnapshot>()
  for (const snapshot of typedSnapshots) latestByMapping.set(snapshot.competitor_product_id, snapshot)
  const comparisonRows = mappingRows
    .map((mapping) => ({
      mapping,
      latest: latestByMapping.get(mapping.id),
      delta: typedProduct.our_price !== null && latestByMapping.get(mapping.id)?.price !== null && latestByMapping.get(mapping.id)?.price !== undefined
        ? Number(latestByMapping.get(mapping.id)?.price) - Number(typedProduct.our_price)
        : null,
    }))
    .sort((a, b) => Number(a.latest?.price ?? Number.POSITIVE_INFINITY) - Number(b.latest?.price ?? Number.POSITIVE_INFINITY))
  const cheapest = comparisonRows.find((row) => row.latest?.price !== null && row.latest?.price !== undefined)

  return (
    <>
      <PageHeader
        eyebrow="Produktanalyse"
        title={typedProduct.name}
        description={<>Preisverlauf und Quellenstatus für {typedProduct.our_sku ?? 'dieses Produkt'}.</>}
        actions={<Link href="/dashboard/products" className="button-secondary">Zurück</Link>}
      />

      {insight && (
        <section className="panel mb-6 border-l-4 border-l-merchant-success p-5 sm:p-6" aria-labelledby="price-insight">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
            <div>
              <p className="eyebrow">Preiseinordnung</p>
              <h2 id="price-insight" className="mt-2 text-xl font-semibold">Warum das wichtig ist</h2>
              <p className="mt-3 text-sm leading-6 text-vault-300">{insight.commentary}</p>
              <p className="mt-3 text-xs leading-5 text-vault-500">{insight.corridor_reason}</p>
            </div>
            <div className="border-l border-vault-700 pl-5">
              <p className="text-xs text-vault-500">Empfohlener Preisbereich</p>
              <p className="mt-2 font-mono text-xl font-semibold text-merchant-success">{formatPrice(insight.corridor_min)} – {formatPrice(insight.corridor_max)}</p>
              <p className="mt-2 text-xs text-vault-500">{formatRelativeTime(insight.generated_at)} · {insight.model}</p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section className="panel p-5 sm:p-6" aria-labelledby="trend">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Historie</p>
              <h2 id="trend" className="mt-2 text-xl font-semibold">Preisverlauf je Quelle</h2>
            </div>
            <p className="font-mono text-xs text-vault-500">{typedSnapshots.length} Messpunkte</p>
          </div>
          {growthFeaturesEnabled ? (
            <PriceTrendChart
              snapshots={typedSnapshots}
              sources={mappingRows.map((mapping) => ({
                id: mapping.id,
                label: mapping.competitors?.shop_name ?? 'Mitbewerber',
              }))}
            />
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
              Historische Preisverläufe sind ab dem Pro-Plan verfügbar.
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="panel p-5">
            <p className="eyebrow">Eigener Preis</p>
            <h2 className="mt-2 text-2xl font-semibold">{formatPrice(typedProduct.our_price, typedProduct.our_currency)}</h2>
            <p className="mt-2 font-mono text-xs text-vault-500">{typedProduct.our_sku ?? 'Keine SKU'}</p>
          </section>

          <section className="panel overflow-hidden" aria-labelledby="variants">
            <div className="border-b border-vault-700 px-5 py-4">
              <h2 id="variants" className="font-semibold">Varianten</h2>
            </div>
            <div className="divide-y divide-vault-700/70">
              {typedVariants.map((variant) => (
                <article key={variant.id} className="grid gap-4 p-5 text-sm">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
                  <div>
                    <p className="font-semibold">{variant.name}{variant.is_default ? ' · Standard' : ''}</p>
                    <p className="mt-1 font-mono text-xs text-vault-500">{variant.sku ?? 'Keine SKU'}{variant.gtin ? ` · GTIN ${variant.gtin}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold">{formatPrice(variant.our_price, variant.currency)}</p>
                    <p className="mt-1 text-xs text-vault-500">EK {formatPrice(variant.cost_price, variant.currency)}</p>
                  </div>
                  </div>
                  {hasPlan(tenant.plan, 'pro') && (
                    <form action={updateMapPrice} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <input type="hidden" name="variant_id" value={variant.id} />
                      <label>
                        <span className="field-label">Mindestwerbepreis (MAP) €</span>
                        <input className="field" name="map_price" type="number" min="0" step="0.01" defaultValue={variant.map_price ?? ''} />
                      </label>
                      <button className="button-secondary">Speichern</button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="panel overflow-hidden" aria-labelledby="sources">
            <div className="border-b border-vault-700 px-5 py-4">
              <h2 id="sources" className="font-semibold">Quellen</h2>
            </div>
            <div className="divide-y divide-vault-700/70">
              {mappingRows.map((mapping) => {
                const latest = latestByMapping.get(mapping.id)
                return (
                  <article key={mapping.id} className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">{mapping.competitors?.shop_name ?? 'Mitbewerber'} · {mapping.product_variants?.name ?? 'Standard'}</h3>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        mapping.health_status === 'broken'
                          ? 'bg-red-50 text-red-700'
                          : mapping.health_status === 'degraded'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {mapping.health_status === 'broken' ? 'Defekt' : mapping.health_status === 'degraded' ? 'Degradiert' : 'Gesund'}
                      </span>
                    </div>
                    <p className="mt-2 font-mono text-sm text-vault-300">{formatPrice(latest?.price ?? null)}</p>
                    <p className="mt-1 text-xs text-vault-500">
                      {latest?.scraped_at ? formatRelativeTime(latest.scraped_at) : 'Noch nie abgerufen'}
                    </p>
                  </article>
                )
              })}
              {!mappingRows.length && <p className="p-5 text-sm text-vault-400">Noch keine Preisquellen verbunden.</p>}
            </div>
          </section>
        </aside>
      </div>

      {growthFeaturesEnabled && (
        <section className="panel mt-6 overflow-hidden" aria-labelledby="comparison">
          <div className="border-b border-vault-700 px-5 py-4">
            <p className="eyebrow">Mehrquellenvergleich</p>
            <h2 id="comparison" className="mt-2 font-semibold">Aktuelle Preise nach Quelle</h2>
            {cheapest && <p className="mt-1 text-sm text-vault-500">Niedrigster aktueller Preis: {cheapest.mapping.competitors?.shop_name ?? 'Mitbewerber'} mit {formatPrice(cheapest.latest?.price ?? null)}</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-vault-700 text-sm">
              <thead className="bg-vault-950 text-left text-xs uppercase tracking-[0.08em] text-vault-500">
                <tr>
                  <th className="px-5 py-3">Mitbewerber</th>
                  <th className="px-5 py-3">Variante</th>
                  <th className="px-5 py-3">Preis</th>
                  <th className="px-5 py-3">Abstand zu dir</th>
                  <th className="px-5 py-3">Bestand</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vault-700">
                {comparisonRows.map(({ mapping, latest, delta }) => (
                  <tr key={mapping.id}>
                    <td className="px-5 py-4 font-semibold">{mapping.competitors?.shop_name ?? 'Mitbewerber'}</td>
                    <td className="px-5 py-4 text-vault-500">{mapping.product_variants?.name ?? 'Standard'}</td>
                    <td className="px-5 py-4 font-mono">{formatPrice(latest?.price ?? null)}</td>
                    <td className={`px-5 py-4 font-mono ${delta !== null && delta < 0 ? 'text-red-700' : 'text-vault-500'}`}>{delta === null ? '–' : formatPrice(delta)}</td>
                    <td className="px-5 py-4">{latest?.in_stock === null || latest?.in_stock === undefined ? 'Unbekannt' : latest.in_stock ? 'Auf Lager' : 'Nicht verfügbar'}</td>
                    <td className="px-5 py-4">{mapping.health_status === 'broken' ? 'Defekt' : mapping.health_status === 'degraded' ? 'Degradiert' : mapping.health_status === 'blocked' ? 'Blockiert' : 'Gesund'}</td>
                  </tr>
                ))}
                {!comparisonRows.length && (
                  <tr><td colSpan={6} className="px-5 py-6 text-vault-500">Noch keine Quellen für den Vergleich vorhanden.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
