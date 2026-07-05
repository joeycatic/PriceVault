import { revalidatePath } from 'next/cache'
import { Activity, BarChart3, Building2, Globe2, MapPin, Package, Pencil, ShieldCheck, Store } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { CompanyForm } from '@/components/ui/ProductForms'
import { PageHeader } from '@/components/ui/MerchantUI'
import { currentTenant } from '@/lib/backend'
import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  INDUSTRY_OPTIONS,
  REVENUE_BAND_OPTIONS,
  SHOP_PLATFORM_OPTIONS,
  optionLabel,
  optionValues,
} from '@/lib/company-profile'
import { createClient } from '@/lib/supabase/server'
import type { LatestPrice } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

function validHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function optionalText(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim() || null
}

function requiredOption(formData: FormData, key: string, allowed: Set<string>) {
  const value = String(formData.get(key) ?? '').trim()
  return allowed.has(value) ? value : null
}

function optionalOption(formData: FormData, key: string, allowed: Set<string>) {
  const value = String(formData.get(key) ?? '').trim()
  if (!value) return null
  return allowed.has(value) ? value : undefined
}

function initialsFromName(name: string) {
  const parts = name
    .split(/[\s-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length) return 'PV'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export default async function CompanyPage() {
  const supabase = await createClient()
  const tenant = await currentTenant()
  const canEditCompany = tenant?.membership_role === 'owner'

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
  const overviewMetrics: Array<{ label: string; value: string | number; detail: string; icon: LucideIcon }> = [
    { label: 'Aktive Produkte', value: productResult.count ?? 0, detail: 'Sortiment im Monitoring', icon: Package },
    { label: 'Preisquellen', value: mappingResult.count ?? 0, detail: 'Verknüpfte Quellen', icon: Activity },
    { label: 'Letzter Abruf', value: lastScrapedAt ? formatRelativeTime(lastScrapedAt) : 'Noch nie', detail: optionLabel(SHOP_PLATFORM_OPTIONS, tenant?.shop_platform), icon: BarChart3 },
  ]
  const companyStatusItems: Array<{ label: string; value: string; icon: LucideIcon }> = tenant ? [
    { label: 'Branche', value: optionLabel(INDUSTRY_OPTIONS, tenant.industry), icon: Store },
    { label: 'Größe', value: optionLabel(COMPANY_SIZE_OPTIONS, tenant.company_size), icon: Building2 },
    { label: 'Shop-System', value: optionLabel(SHOP_PLATFORM_OPTIONS, tenant.shop_platform), icon: Globe2 },
    { label: 'Hauptmarkt', value: optionLabel(COUNTRY_OPTIONS, tenant.headquarters_country), icon: MapPin },
    { label: 'Jahresumsatz', value: optionLabel(REVENUE_BAND_OPTIONS, tenant.annual_revenue_band), icon: BarChart3 },
    { label: 'Plan', value: tenant.plan, icon: ShieldCheck },
  ] : []

  async function updateCompany(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    if (tenant.membership_role !== 'owner') {
      return { ok: false, message: 'Nur Owner dürfen das Unternehmen bearbeiten.' }
    }
    const client = await createClient()
    const shopName = String(formData.get('shop_name') ?? '').trim()
    const shopUrl = String(formData.get('shop_url') ?? '').trim()
    const industry = requiredOption(formData, 'industry', optionValues(INDUSTRY_OPTIONS))
    const companySize = requiredOption(formData, 'company_size', optionValues(COMPANY_SIZE_OPTIONS))
    const shopPlatform = optionalOption(formData, 'shop_platform', optionValues(SHOP_PLATFORM_OPTIONS))
    const revenueBand = optionalOption(formData, 'annual_revenue_band', optionValues(REVENUE_BAND_OPTIONS))
    const headquartersCountry = requiredOption(formData, 'headquarters_country', optionValues(COUNTRY_OPTIONS))
    if (shopName.length < 2 || !validHttpUrl(shopUrl)) {
      return { ok: false, message: 'Bitte prüfe Firmenname und Shop-URL.' }
    }
    if (!industry || !companySize || shopPlatform === undefined || revenueBand === undefined || !headquartersCountry) {
      return { ok: false, message: 'Bitte prüfe Branche, Unternehmensgröße und Standort.' }
    }

    const { error } = await client
      .from('tenants')
      .update({
        shop_name: shopName,
        shop_url: shopUrl,
        company_legal_name: optionalText(formData, 'company_legal_name'),
        company_size: companySize,
        industry,
        shop_platform: shopPlatform,
        headquarters_country: headquartersCountry,
        headquarters_city: optionalText(formData, 'headquarters_city'),
        annual_revenue_band: revenueBand,
        vat_id: optionalText(formData, 'vat_id'),
      })
      .eq('id', tenant.id)
    if (error) return { ok: false, message: 'Unternehmen konnte nicht gespeichert werden.' }

    revalidatePath('/dashboard', 'layout')
    revalidatePath('/dashboard/company')
    return { ok: true, message: 'Unternehmen gespeichert.' }
  }

  return (
    <>
      <PageHeader
        eyebrow="Unternehmensbasis"
        title="Dein Unternehmen"
        description="Diese Daten definieren deinen Mandanten, deinen eigenen Shop und die Referenz für Produktpreise und Wettbewerbsvergleiche."
        actions={canEditCompany ? <a href="#company-profile" className="button-primary gap-2"><Pencil className="h-4 w-4" aria-hidden="true" /> Profil bearbeiten</a> : null}
      />

      {!tenant ? (
        <div className="panel p-6 text-sm text-amber-800">Für dieses Konto wurde noch kein Mandant eingerichtet.</div>
      ) : (
        <>
          <section className="mb-6 overflow-hidden rounded-2xl border border-vault-700 bg-vault-100 text-white shadow-[0_20px_60px_rgba(26,26,26,.14)]" aria-label="Unternehmensüberblick">
            <div className="relative grid gap-px bg-white/10 lg:grid-cols-[1.15fr_.85fr_.85fr_.85fr]">
              <div className="relative overflow-hidden bg-vault-100 p-6">
                <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-merchant-success/25 blur-3xl" aria-hidden="true" />
                <div className="relative flex items-start gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-lg font-black text-vault-100 shadow-sm">
                    {initialsFromName(tenant.shop_name)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                      Firmenprofil
                    </p>
                    <h2 className="mt-2 truncate text-2xl font-bold tracking-[-0.03em]">{tenant.shop_name}</h2>
                    <a href={tenant.shop_url} target="_blank" rel="noreferrer" className="mt-2 flex min-w-0 items-center gap-2 font-mono text-xs text-white/65 transition hover:text-white">
                      <Globe2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{tenant.shop_url}</span>
                    </a>
                  </div>
                </div>
                <p className="relative mt-5 max-w-xl text-sm leading-6 text-white/65">
                  Unternehmensdaten, Standort und Shop-Kontext steuern Navigation, Reports und die Referenzbasis für Wettbewerbsvergleiche.
                </p>
              </div>
              {overviewMetrics.map((item) => {
                const Icon = item.icon
                return (
                  <article key={item.label} className="bg-vault-100 p-6">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{item.label}</p>
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10">
                        <Icon className="h-4 w-4 text-white/75" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="mt-6 truncate text-2xl font-bold">{item.value}</p>
                    <p className="mt-1 text-xs text-white/55">{item.detail}</p>
                  </article>
                )
              })}
            </div>
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section className="panel overflow-hidden" aria-labelledby="company-profile">
              <div className="border-b border-vault-700 bg-white px-5 py-4 sm:px-6">
                <p className="eyebrow">Eigene Firma</p>
                <h2 id="company-profile" className="mt-2 text-xl font-semibold">Unternehmensprofil</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
                  Halte Shopname und Shop-URL stabil. Diese Angaben werden in Navigation, Onboarding-Kontext und späteren Reports genutzt.
                </p>
              </div>
              <div className="p-5 sm:p-6">
                {canEditCompany ? (
                  <CompanyForm action={updateCompany} tenant={tenant} />
                ) : (
                  <div className="rounded-xl border border-vault-700 bg-vault-800 p-4 text-sm text-vault-300">
                    Nur Owner dürfen das Unternehmensprofil bearbeiten.
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-6 xl:sticky xl:top-20">
              <section className="panel overflow-hidden" aria-labelledby="company-health">
                <div className="border-b border-vault-700 bg-vault-100 px-5 py-4 text-white">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Status
                  </p>
                  <h2 id="company-health" className="mt-2 text-xl font-bold">Mandantenüberblick</h2>
                </div>
                <div className="grid gap-px bg-vault-700">
                  {companyStatusItems.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center gap-3 bg-vault-900 px-5 py-4">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white">
                        <Icon className="h-4 w-4 text-vault-100" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-vault-500">{label}</p>
                        <p className="mt-1 truncate text-sm font-semibold">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-merchant-success/30 bg-emerald-100" aria-labelledby="company-next">
                <div className="p-5">
                  <p className="eyebrow text-merchant-success">Nächster sinnvoller Schritt</p>
                  <h2 id="company-next" className="mt-2 font-semibold">Katalog und Preisquellen getrennt pflegen</h2>
                  <p className="mt-2 text-sm leading-6 text-vault-300">
                    Produkte und Importe liegen im Bereich Produkte. Scraping-Abläufe, API und Fehlerbehebung stehen dauerhaft im Wiki.
                  </p>
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
    </>
  )
}
