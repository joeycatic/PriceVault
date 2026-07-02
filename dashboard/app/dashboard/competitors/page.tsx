import Link from 'next/link'
import { revalidatePath } from 'next/cache'

import { CompetitorForm } from '@/components/ui/CompetitorForm'
import { PageHeader } from '@/components/ui/MerchantUI'
import { backendFetch, currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import type { Competitor } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

export default async function CompetitorsPage() {
  const supabase = await createClient()
  const tenant = await currentTenant()
  const { data } = tenant
    ? await supabase.from('competitors').select('*').eq('tenant_id', tenant.id).order('shop_name')
    : { data: [] }
  const competitors = (data ?? []) as Competitor[]

  async function saveAction(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const { error } = await client.from('competitors').insert({
      tenant_id: tenant.id,
      shop_name: String(formData.get('shop_name')),
      base_url: String(formData.get('base_url')),
      selector_price: String(formData.get('selector_price') || '') || null,
      selector_stock: String(formData.get('selector_stock') || '') || null,
      scrape_freq_h: Number(formData.get('scrape_freq_h')),
    })
    if (error) return { ok: false, message: 'Der Mitbewerber konnte nicht gespeichert werden.' }
    revalidatePath('/dashboard/competitors')
    return { ok: true, message: 'Mitbewerber wurde angelegt.' }
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

  async function remove(formData: FormData) {
    'use server'
    if (!tenant) return
    const client = await createClient()
    await client
      .from('competitors')
      .update({ active: false })
      .eq('tenant_id', tenant.id)
      .eq('id', String(formData.get('id')))
    await client
      .from('competitor_products')
      .update({ active: false })
      .eq('tenant_id', tenant.id)
      .eq('competitor_id', String(formData.get('id')))
    revalidatePath('/dashboard/competitors')
    revalidatePath('/dashboard')
  }

  return (
    <>
      <PageHeader eyebrow="Quellenverwaltung" title="Mitbewerber" description="Shops und deren Preis-Selektoren verwalten." />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,.8fr)]">
        <section className="panel overflow-hidden" aria-labelledby="competitor-list">
          <div className="border-b border-vault-700 px-5 py-4">
            <h2 id="competitor-list" className="font-semibold">Erfasste Shops</h2>
          </div>
          {competitors.length ? (
            <div className="divide-y divide-vault-700/70">
              {competitors.map((competitor) => (
                <article key={competitor.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${competitor.active ? 'bg-merchant-success' : 'bg-vault-500'}`} />
                      <h3 className="truncate font-semibold">{competitor.shop_name}</h3>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-vault-500">{competitor.base_url}</p>
                    <p className="mt-2 text-xs text-vault-500">Letzter Abruf: {formatRelativeTime(competitor.last_scraped_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link className="button-secondary" href={`/dashboard/competitors/${competitor.id}`}>Bearbeiten</Link>
                    {competitor.active && (
                      <form action={remove}>
                        <input type="hidden" name="id" value={competitor.id} />
                        <button className="button-secondary text-red-800">Deaktivieren</button>
                      </form>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="p-6 text-sm text-vault-300">Noch keine Mitbewerber angelegt.</p>
          )}
        </section>

        <section className="panel p-5 sm:p-6" aria-labelledby="new-competitor">
          <p className="eyebrow">Neue Quelle</p>
          <h2 id="new-competitor" className="mb-6 mt-2 text-xl font-semibold">Mitbewerber anlegen</h2>
          <CompetitorForm saveAction={saveAction} testAction={testAction} />
        </section>
      </div>
    </>
  )
}
