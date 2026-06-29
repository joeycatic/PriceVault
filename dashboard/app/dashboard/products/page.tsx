import { revalidatePath } from 'next/cache'

import { MutationButton } from '@/components/ui/MutationButton'
import { MappingForm, ProductForm } from '@/components/ui/ProductForms'
import { createClient } from '@/lib/supabase/server'
import type { Competitor, CompetitorProduct, Product, Tenant } from '@/lib/types'
import { formatPrice } from '@/lib/utils'

type MappingRow = CompetitorProduct & {
  products: { name: string } | null
  competitors: { shop_name: string } | null
}

export default async function ProductsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: tenantData } = await supabase.from('tenants').select('*').eq('user_id', user!.id).maybeSingle()
  const tenant = tenantData as Tenant | null

  const [productResult, competitorResult, mappingResult] = tenant
    ? await Promise.all([
        supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('active', true).order('name'),
        supabase.from('competitors').select('*').eq('tenant_id', tenant.id).eq('active', true).order('shop_name'),
        supabase
          .from('competitor_products')
          .select('*, products(name), competitors(shop_name)')
          .eq('tenant_id', tenant.id)
          .eq('active', true)
          .order('created_at'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const products = (productResult.data ?? []) as Product[]
  const competitors = (competitorResult.data ?? []) as Competitor[]
  const mappings = (mappingResult.data ?? []) as MappingRow[]

  async function createProduct(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const name = String(formData.get('name') ?? '').trim()
    const rawPrice = String(formData.get('our_price') ?? '').trim().replace(',', '.')
    const price = rawPrice ? Number(rawPrice) : null
    if (!name || (price !== null && (!Number.isFinite(price) || price < 0))) {
      return { ok: false, message: 'Bitte prüfe Produktname und Preis.' }
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
        <p className="eyebrow">Katalog / Zuordnung</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Produkte</h1>
        <p className="mt-2 text-sm text-vault-300">Eigene Produkte mit den Produktseiten deiner Mitbewerber verbinden.</p>
      </header>

      {!tenant ? (
        <div className="panel p-6 text-sm text-amber-100">Für dieses Konto wurde noch kein Mandant eingerichtet.</div>
      ) : (
        <div className="space-y-6">
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <section className="panel p-5 sm:p-6" aria-labelledby="new-product">
              <p className="eyebrow">Katalog</p>
              <h2 id="new-product" className="mb-5 mt-2 text-xl font-semibold">Produkt anlegen</h2>
              <ProductForm action={createProduct} />
            </section>

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
                      <th className="px-4 py-4">Produkt-URL</th>
                      <th className="px-5 py-4 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((mapping) => {
                      const product = products.find((item) => item.id === mapping.product_id)
                      return (
                        <tr key={mapping.id} className="border-t border-vault-700/70">
                          <td className="px-5 py-4 font-semibold">{mapping.products?.name ?? 'Unbekannt'}</td>
                          <td className="px-4 py-4 font-mono text-vault-300">{formatPrice(product?.our_price ?? null)}</td>
                          <td className="px-4 py-4">{mapping.competitors?.shop_name ?? 'Unbekannt'}</td>
                          <td className="max-w-xs truncate px-4 py-4 font-mono text-xs text-vault-500">{mapping.competitor_url}</td>
                          <td className="px-5 py-4 text-right">
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
