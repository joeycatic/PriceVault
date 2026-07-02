import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'

import { CompetitorForm } from '@/components/ui/CompetitorForm'
import { backendFetch, currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import type { Competitor } from '@/lib/types'

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

  async function saveAction(formData: FormData) {
    'use server'
    const client = await createClient()
    const { error } = await client
      .from('competitors')
      .update({
        shop_name: String(formData.get('shop_name')),
        base_url: String(formData.get('base_url')),
        selector_price: String(formData.get('selector_price') || '') || null,
        selector_stock: String(formData.get('selector_stock') || '') || null,
        scrape_freq_h: Number(formData.get('scrape_freq_h')),
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

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <Link href="/dashboard/competitors" className="text-xs text-vault-300 hover:text-vault-lime">← Zurück zu Mitbewerbern</Link>
        <p className="eyebrow mt-6">Quellenverwaltung</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{competitor.shop_name}</h1>
        <p className="mt-2 text-sm text-vault-300">Shopdaten und Selektoren bearbeiten.</p>
      </header>
      <section className="panel max-w-3xl p-5 sm:p-7">
        <CompetitorForm competitor={competitor} saveAction={saveAction} testAction={testAction} />
      </section>
    </>
  )
}
