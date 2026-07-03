import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/ui/MerchantUI'
import { PriceTrendChart } from '@/components/ui/PriceTrendChart'
import { currentTenant } from '@/lib/backend'
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
          <PriceTrendChart
            snapshots={typedSnapshots}
            sources={mappingRows.map((mapping) => ({
              id: mapping.id,
              label: mapping.competitors?.shop_name ?? 'Mitbewerber',
            }))}
          />
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
                <article key={variant.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 p-5 text-sm">
                  <div>
                    <p className="font-semibold">{variant.name}{variant.is_default ? ' · Standard' : ''}</p>
                    <p className="mt-1 font-mono text-xs text-vault-500">{variant.sku ?? 'Keine SKU'}{variant.gtin ? ` · GTIN ${variant.gtin}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold">{formatPrice(variant.our_price, variant.currency)}</p>
                    <p className="mt-1 text-xs text-vault-500">EK {formatPrice(variant.cost_price, variant.currency)}</p>
                  </div>
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
    </>
  )
}
