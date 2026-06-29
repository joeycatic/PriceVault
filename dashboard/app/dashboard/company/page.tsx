import { revalidatePath } from 'next/cache'

import { CompanyForm } from '@/components/ui/ProductForms'
import { createClient } from '@/lib/supabase/server'
import type { LatestPrice, Tenant } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

function validHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export default async function CompanyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: tenantData } = await supabase.from('tenants').select('*').eq('user_id', user!.id).maybeSingle()
  const tenant = tenantData as Tenant | null

  const [productResult, mappingResult, latestResult] = tenant
    ? await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('active', true),
        supabase.from('competitor_products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('active', true),
        supabase.from('v_latest_prices').select('scraped_at').eq('tenant_id', tenant.id),
      ])
    : [{ count: 0 }, { count: 0 }, { data: [] }]

  const latestRows = (latestResult.data ?? []) as Pick<LatestPrice, 'scraped_at'>[]
  const lastScrapedAt = latestRows
    .map((row) => row.scraped_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null

  async function updateCompany(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const shopName = String(formData.get('shop_name') ?? '').trim()
    const shopUrl = String(formData.get('shop_url') ?? '').trim()
    if (shopName.length < 2 || !validHttpUrl(shopUrl)) {
      return { ok: false, message: 'Bitte prüfe Firmenname und Shop-URL.' }
    }

    const { error } = await client
      .from('tenants')
      .update({ shop_name: shopName, shop_url: shopUrl })
      .eq('id', tenant.id)
    if (error) return { ok: false, message: 'Unternehmen konnte nicht gespeichert werden.' }

    revalidatePath('/dashboard', 'layout')
    revalidatePath('/dashboard/company')
    return { ok: true, message: 'Unternehmen gespeichert.' }
  }

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Unternehmensbasis</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Dein Unternehmen</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
          Diese Daten definieren deinen Mandanten, deinen eigenen Shop und die Referenz für Produktpreise und Wettbewerbsvergleiche.
        </p>
      </header>

      {!tenant ? (
        <div className="panel p-6 text-sm text-amber-100">Für dieses Konto wurde noch kein Mandant eingerichtet.</div>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="panel p-5 sm:p-6" aria-labelledby="company-profile">
            <p className="eyebrow">Eigene Firma</p>
            <h2 id="company-profile" className="mt-2 text-xl font-semibold">Unternehmensprofil</h2>
            <p className="mt-2 text-sm leading-6 text-vault-300">
              Halte Shopname und Shop-URL stabil. Diese Angaben werden in Navigation, Onboarding-Kontext und späteren Reports genutzt.
            </p>
            <CompanyForm action={updateCompany} shopName={tenant.shop_name} shopUrl={tenant.shop_url} />
          </section>

          <aside className="space-y-6">
            <section className="panel overflow-hidden" aria-labelledby="company-health">
              <div className="border-b border-vault-700 px-5 py-4">
                <p className="eyebrow">Status</p>
                <h2 id="company-health" className="mt-2 font-semibold">Mandantenüberblick</h2>
              </div>
              <div className="grid gap-px bg-vault-700">
                {[
                  ['Aktive Produkte', productResult.count ?? 0],
                  ['Aktive Preisquellen', mappingResult.count ?? 0],
                  ['Letzter Preisabruf', lastScrapedAt ? formatRelativeTime(lastScrapedAt) : 'Noch nie'],
                  ['Plan', tenant.plan],
                ].map(([label, value]) => (
                  <div key={label} className="bg-vault-900 px-5 py-4">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-vault-500">{label}</p>
                    <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-vault-lime/30 bg-vault-lime/10 p-5" aria-labelledby="company-next">
              <p className="eyebrow text-vault-lime">Nächster sinnvoller Schritt</p>
              <h2 id="company-next" className="mt-2 font-semibold">Katalog und Preisquellen getrennt pflegen</h2>
              <p className="mt-2 text-sm leading-6 text-vault-300">
                Produkte und Importe liegen im Bereich Produkte. Scraping-Abläufe, API und Fehlerbehebung stehen dauerhaft im Wiki.
              </p>
            </section>
          </aside>
        </div>
      )}
    </>
  )
}
