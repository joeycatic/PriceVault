import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import type { Competitor, CompetitorProduct, Product, Tenant } from '@/lib/types'
import { formatPrice } from '@/lib/utils'

type MappingRow = CompetitorProduct & {
  products: { name: string } | null
  competitors: { shop_name: string } | null
}

export default async function ProductsPage() {
  const supabase = createClient()
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
          .order('created_at'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const products = (productResult.data ?? []) as Product[]
  const competitors = (competitorResult.data ?? []) as Competitor[]
  const mappings = (mappingResult.data ?? []) as MappingRow[]

  async function createProduct(formData: FormData) {
    'use server'
    if (!tenant) return
    const client = createClient()
    const price = String(formData.get('our_price') ?? '').replace(',', '.')
    await client.from('products').insert({
      tenant_id: tenant.id,
      name: String(formData.get('name')),
      our_sku: String(formData.get('our_sku') || '') || null,
      our_price: price ? Number(price) : null,
      our_currency: 'EUR',
    })
    revalidatePath('/dashboard/products')
  }

  async function createMapping(formData: FormData) {
    'use server'
    if (!tenant) return
    const client = createClient()
    await client.from('competitor_products').insert({
      tenant_id: tenant.id,
      product_id: String(formData.get('product_id')),
      competitor_id: String(formData.get('competitor_id')),
      competitor_url: String(formData.get('competitor_url')),
      competitor_sku: String(formData.get('competitor_sku') || '') || null,
      selector_price: String(formData.get('selector_price') || '') || null,
    })
    revalidatePath('/dashboard/products')
  }

  async function deleteMapping(formData: FormData) {
    'use server'
    if (!tenant) return
    const client = createClient()
    await client
      .from('competitor_products')
      .delete()
      .eq('tenant_id', tenant.id)
      .eq('id', String(formData.get('id')))
    revalidatePath('/dashboard/products')
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
              <form action={createProduct} className="space-y-4">
                <label>
                  <span className="field-label">Produktname</span>
                  <input className="field" name="name" required placeholder="Mars Hydro SP3000" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="field-label">Eigene Artikelnummer</span>
                    <input className="field" name="our_sku" placeholder="SKU-1001" />
                  </label>
                  <label>
                    <span className="field-label">Eigener Preis</span>
                    <input className="field" name="our_price" inputMode="decimal" placeholder="199,00" />
                  </label>
                </div>
                <button className="button-primary w-full sm:w-auto">Produkt anlegen</button>
              </form>
            </section>

            <section className="panel p-5 sm:p-6" aria-labelledby="new-mapping">
              <p className="eyebrow">Preisquelle</p>
              <h2 id="new-mapping" className="mb-5 mt-2 text-xl font-semibold">Zuordnung anlegen</h2>
              <form action={createMapping} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="field-label">Produkt</span>
                    <select className="field" name="product_id" required defaultValue="">
                      <option value="" disabled>Produkt wählen</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Mitbewerber</span>
                    <select className="field" name="competitor_id" required defaultValue="">
                      <option value="" disabled>Shop wählen</option>
                      {competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.shop_name}</option>)}
                    </select>
                  </label>
                </div>
                <label>
                  <span className="field-label">Produkt-URL beim Mitbewerber</span>
                  <input className="field" name="competitor_url" type="url" required placeholder="https://shop.de/produkt" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="field-label">Deren Artikelnummer</span>
                    <input className="field" name="competitor_sku" placeholder="Optional" />
                  </label>
                  <label>
                    <span className="field-label">Eigener Preis-Selektor</span>
                    <input className="field font-mono" name="selector_price" placeholder="Optional" />
                  </label>
                </div>
                <button className="button-primary w-full sm:w-auto" disabled={!products.length || !competitors.length}>Zuordnung speichern</button>
              </form>
            </section>
          </div>

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
                            <form action={deleteMapping}>
                              <input type="hidden" name="id" value={mapping.id} />
                              <button className="text-xs font-semibold text-red-300 hover:text-red-200">Entfernen</button>
                            </form>
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

