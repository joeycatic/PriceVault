import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'

import { CompetitorForm } from '@/components/ui/CompetitorForm'
import { createClient } from '@/lib/supabase/server'
import type { Competitor, Tenant } from '@/lib/types'

export default async function EditCompetitorPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: tenantData } = await supabase.from('tenants').select('*').eq('user_id', user!.id).maybeSingle()
  const tenant = tenantData as Tenant | null
  if (!tenant) notFound()

  const { data } = await supabase
    .from('competitors')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('id', params.id)
    .maybeSingle()
  const competitor = data as Competitor | null
  if (!competitor) notFound()

  async function saveAction(formData: FormData) {
    'use server'
    const client = createClient()
    const { error } = await client
      .from('competitors')
      .update({
        shop_name: String(formData.get('shop_name')),
        base_url: String(formData.get('base_url')),
        selector_price: String(formData.get('selector_price') || '') || null,
        selector_stock: String(formData.get('selector_stock') || '') || null,
        scrape_freq_h: Number(formData.get('scrape_freq_h')),
      })
      .eq('tenant_id', tenant.id)
      .eq('id', competitor.id)
    if (error) return { ok: false, message: 'Die Änderungen konnten nicht gespeichert werden.' }
    revalidatePath('/dashboard/competitors')
    revalidatePath(`/dashboard/competitors/${competitor.id}`)
    return { ok: true, message: 'Änderungen wurden gespeichert.' }
  }

  async function testAction(input: { url: string; selectorPrice: string; selectorStock: string }) {
    'use server'
    try {
      const response = await fetch(`${process.env.BACKEND_URL}/scrape/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': tenant.id },
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

