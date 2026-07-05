'use client'

import { CheckCircle2, Package, Radar, Rocket, ShieldCheck, Store } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import type { OnboardingResult } from '@/app/onboarding/actions'
import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  INDUSTRY_OPTIONS,
  REVENUE_BAND_OPTIONS,
  SHOP_PLATFORM_OPTIONS,
} from '@/lib/company-profile'
import { formatPriceInput, parsePriceInput } from '@/lib/priceInput'

type ProductOption = { id: string; name: string }
type CompetitorOption = { id: string; shop_name: string }
type CheckState = 'waiting' | 'valid' | 'invalid'
type ShopPrefill = {
  shop_name?: string
  shop_url?: string
  company_legal_name?: string
  company_size?: string
  industry?: string
  shop_platform?: string
  headquarters_country?: string
  headquarters_city?: string
  annual_revenue_band?: string
}

const steps = [
  { number: 1, label: 'Dein Shop', hint: 'Arbeitsbereich anlegen', icon: Store },
  { number: 2, label: 'Erstes Produkt', hint: 'Eigenen Preis erfassen', icon: Package },
  { number: 3, label: 'Preisquelle', hint: 'Mitbewerber verbinden', icon: Radar },
  { number: 4, label: 'Bereit', hint: 'Monitoring starten', icon: Rocket },
] satisfies Array<{ number: number; label: string; hint: string; icon: LucideIcon }>

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function fieldState(value: string, valid: boolean) {
  if (!value) return 'field'
  return `field ${valid ? 'field-verified' : 'field-invalid'}`
}

function LiveVerification({
  items,
}: {
  items: Array<{ label: string; state: CheckState }>
}) {
  const complete = items.every((item) => item.state === 'valid')

  return (
    <div className="verification-panel" aria-live="polite" aria-atomic="true">
      <div className="flex items-center justify-between gap-4 border-b border-vault-700/70 px-4 py-3">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase text-vault-300">
          <span className={`verification-pulse ${complete ? 'is-complete' : ''}`} />
          Echtzeitprüfung
        </span>
        <span className={`font-mono text-[10px] ${complete ? 'text-merchant-success' : 'text-vault-500'}`}>
          {complete ? 'BEREIT' : 'PRÜFT'}
        </span>
      </div>
      <ul className="grid gap-px bg-vault-700/60 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 bg-vault-900/95 px-4 py-3 text-xs text-vault-300">
            <span className={`verification-mark is-${item.state}`} aria-hidden="true">
              {item.state === 'valid' ? '✓' : item.state === 'invalid' ? '!' : '·'}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function OnboardingWizard({
  initialStep,
  initialShop,
  signupPrefill,
  initialProducts,
  initialCompetitors,
  email,
  saveShop,
  saveProduct,
  saveSource,
  accountSetupHint = false,
  postSetupHref = '/dashboard',
}: {
  initialStep: number
  initialShop: {
    shop_name: string
    shop_url: string
    company_legal_name?: string | null
    company_size?: string | null
    industry?: string | null
    shop_platform?: string | null
    headquarters_country?: string | null
    headquarters_city?: string | null
    annual_revenue_band?: string | null
  } | null
  signupPrefill?: ShopPrefill
  initialProducts: ProductOption[]
  initialCompetitors: CompetitorOption[]
  email: string
  saveShop: (formData: FormData) => Promise<OnboardingResult>
  saveProduct: (formData: FormData) => Promise<OnboardingResult>
  saveSource: (formData: FormData) => Promise<OnboardingResult>
  accountSetupHint?: boolean
  postSetupHref?: string
}) {
  const router = useRouter()
  const [step, setStep] = useState(initialStep)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<OnboardingResult | null>(null)
  const [products, setProducts] = useState(initialProducts)
  const [competitorMode, setCompetitorMode] = useState(initialCompetitors.length ? 'existing' : 'new')
  const [shopFields, setShopFields] = useState({
    shop_name: initialShop?.shop_name ?? signupPrefill?.shop_name ?? '',
    shop_url: initialShop?.shop_url ?? signupPrefill?.shop_url ?? '',
    company_legal_name: initialShop?.company_legal_name ?? signupPrefill?.company_legal_name ?? '',
    company_size: initialShop?.company_size ?? signupPrefill?.company_size ?? '',
    industry: initialShop?.industry ?? signupPrefill?.industry ?? '',
    shop_platform: initialShop?.shop_platform ?? signupPrefill?.shop_platform ?? '',
    headquarters_country: initialShop?.headquarters_country ?? signupPrefill?.headquarters_country ?? 'DE',
    headquarters_city: initialShop?.headquarters_city ?? signupPrefill?.headquarters_city ?? '',
    annual_revenue_band: initialShop?.annual_revenue_band ?? signupPrefill?.annual_revenue_band ?? '',
  })
  const [productFields, setProductFields] = useState({ name: '', our_price: '' })
  const [sourceFields, setSourceFields] = useState({
    product_id: initialProducts.at(-1)?.id ?? '',
    competitor_id: initialCompetitors[0]?.id ?? '',
    shop_name: '',
    base_url: '',
    competitor_url: '',
  })

  const shopNameValid = shopFields.shop_name.trim().length >= 2
  const shopUrlValid = isHttpUrl(shopFields.shop_url)
  const companySizeValid = Boolean(shopFields.company_size)
  const industryValid = Boolean(shopFields.industry)
  const shopReady = shopNameValid && shopUrlValid && companySizeValid && industryValid
  const productNameValid = productFields.name.trim().length >= 2
  const parsedProductPrice = productFields.our_price.trim() ? parsePriceInput(productFields.our_price) : null
  const productPriceValid = !productFields.our_price.trim() || (parsedProductPrice !== null && parsedProductPrice >= 0)
  const productReady = productNameValid && productPriceValid
  const sourceProductValid = Boolean(sourceFields.product_id)
  const selectedProduct = products.find((product) => product.id === sourceFields.product_id) ?? products.at(-1)
  const sourceCompetitorValid = competitorMode === 'existing'
    ? Boolean(sourceFields.competitor_id)
    : sourceFields.shop_name.trim().length >= 2 && isHttpUrl(sourceFields.base_url)
  const sourceUrlValid = isHttpUrl(sourceFields.competitor_url)
  const sourceReady = sourceProductValid && sourceCompetitorValid && sourceUrlValid

  function runAction(
    action: (formData: FormData) => Promise<OnboardingResult>,
    formData: FormData,
    onSuccess: (next: OnboardingResult) => void,
  ) {
    setResult(null)
    startTransition(async () => {
      const next = await action(formData)
      if (next.ok) {
        setResult(null)
        onSuccess(next)
        router.refresh()
      } else {
        setResult(next)
      }
    })
  }

  function submitShop(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    runAction(saveShop, new FormData(event.currentTarget), () => setStep(2))
  }

  function submitProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    runAction(saveProduct, new FormData(event.currentTarget), (next) => {
      if (next.id && next.name) {
        const { id, name } = next
        setProducts((current) => [...current, { id, name }])
        setSourceFields((current) => ({ ...current, product_id: id }))
      }
      setStep(3)
    })
  }

  function submitSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    runAction(saveSource, new FormData(event.currentTarget), () => setStep(4))
  }

  const currentResult = result && (
    <p
      className={`rounded-lg border px-4 py-3 text-sm ${
        result.ok
          ? 'border-merchant-success bg-emerald-50 text-merchant-success'
          : 'border-red-400 bg-red-400/5 text-red-800'
      }`}
      role={result.ok ? 'status' : 'alert'}
    >
      {result.message}
    </p>
  )

  return (
    <div className="onboarding-shell grid min-h-screen bg-vault-950 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="relative overflow-hidden border-b border-vault-700 bg-vault-100 p-6 text-white sm:p-8 lg:border-b-0 lg:border-r">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-merchant-success/25 blur-3xl" aria-hidden="true" />
        <Link href={initialShop ? '/dashboard' : '/'} className="flex items-center gap-3" aria-label="PriceVault">
          <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-white text-sm font-black text-vault-100">PV</span>
          <span className="font-bold">PriceVault</span>
        </Link>

        <div className="relative mt-10 hidden lg:block">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/55">Einrichtung</p>
          <h1 className="mt-2 text-2xl font-bold">In wenigen Schritten zum Marktüberblick.</h1>
          <p className="mt-4 text-sm leading-6 text-white/65">Deine Angaben bleiben jederzeit im Dashboard bearbeitbar.</p>
        </div>

        <ol className="relative mt-8 grid grid-cols-4 gap-2 lg:mt-12 lg:grid-cols-1 lg:gap-2" aria-label="Fortschritt">
          {steps.map((item) => {
            const active = step === item.number
            const complete = step > item.number
            const Icon = item.icon
            return (
              <li key={item.number} className="min-w-0">
                <button
                  type="button"
                  onClick={() => item.number <= step && setStep(item.number)}
                  disabled={item.number > step}
                  className={`onboarding-step flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition lg:px-4 ${
                    active
                      ? 'is-active border-white/20 bg-white text-vault-100 shadow-sm'
                      : complete
                        ? 'is-complete border-white/10 bg-white/10 text-white hover:bg-white/15'
                        : 'border-white/5 text-white/45'
                  }`}
                  aria-current={active ? 'step' : undefined}
                >
                  <span className={`onboarding-step-mark grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-[10px] ${complete || active ? 'border-vault-100 bg-vault-100 text-white' : 'border-white/15'}`}>
                    {complete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <span className="hidden min-w-0 lg:block">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className={`mt-0.5 block text-[11px] ${active ? 'text-vault-500' : 'text-white/45'}`}>{item.hint}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="relative mt-8 hidden rounded-2xl border border-white/10 bg-white/10 p-4 text-xs text-white/60 lg:block">
          <p className="font-bold uppercase tracking-[0.12em] text-white/40">Angemeldet als</p>
          <p className="mt-2 break-all font-medium text-white">{email}</p>
        </div>
      </aside>

      <main className="flex items-center px-5 py-10 sm:px-10 lg:px-14 xl:px-20">
        <div className="w-full max-w-3xl">
          <div className="mb-7 overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-vault-500">Setup-Fortschritt</p>
                <p className="mt-1 font-semibold">{steps[step - 1]?.label}</p>
              </div>
              <span className="rounded-full bg-vault-950 px-3 py-1 font-mono text-xs text-vault-500">Schritt {step}/4</span>
            </div>
            <div className="h-1.5 bg-vault-700" aria-hidden="true"><div className="h-full rounded-r-full bg-vault-100 transition-[width] duration-500" style={{ width: `${step * 25}%` }} /></div>
          </div>
          {accountSetupHint && (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-vault-300" role="status">
              Magic-Link Login aktiv. Nach der Einrichtung kannst du ein Passwort erstellen und dich künftig auch direkt einloggen.
            </div>
          )}

          {step === 1 && (
            <section aria-labelledby="shop-heading" className="mt-5 animate-reveal">
              <p className="eyebrow">Arbeitsbereich</p>
              <h2 id="shop-heading" className="mt-3 text-2xl font-bold sm:text-3xl">Welchen Shop beobachtest du?</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-vault-300">Damit ordnen wir alle Produkte, Mitbewerber und Preisalarme eindeutig deinem Unternehmen zu.</p>
              <form
                onSubmit={submitShop}
                onChange={(event) => {
                  const target = event.target
                  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return
                  setShopFields((current) => ({ ...current, [target.name]: target.value }))
                }}
                className="mt-9 space-y-7"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Shopname</span>
                    <input
                      className={fieldState(shopFields.shop_name, shopNameValid)}
                      name="shop_name"
                      required
                      autoFocus
                      value={shopFields.shop_name}
                      aria-invalid={Boolean(shopFields.shop_name) && !shopNameValid}
                      placeholder="Mein Onlineshop"
                      onChange={() => undefined}
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Shop-URL</span>
                    <input
                      className={fieldState(shopFields.shop_url, shopUrlValid)}
                      name="shop_url"
                      type="url"
                      required
                      value={shopFields.shop_url}
                      aria-invalid={Boolean(shopFields.shop_url) && !shopUrlValid}
                      placeholder="https://mein-shop.de"
                      onChange={() => undefined}
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Branche</span>
                    <select className={fieldState(shopFields.industry, industryValid)} name="industry" required value={shopFields.industry} onChange={() => undefined}>
                      <option value="" disabled>Branche wählen</option>
                      {INDUSTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="field-label">Unternehmensgröße</span>
                    <select className={fieldState(shopFields.company_size, companySizeValid)} name="company_size" required value={shopFields.company_size} onChange={() => undefined}>
                      <option value="" disabled>Größe wählen</option>
                      {COMPANY_SIZE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
                <details className="rounded-lg border border-vault-700 bg-white p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-vault-100">Weitere Unternehmensdaten ergänzen</summary>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <label className="block">
                      <span className="field-label">Rechtlicher Firmenname</span>
                      <input className="field" name="company_legal_name" value={shopFields.company_legal_name} placeholder="Optional" onChange={() => undefined} />
                    </label>
                    <label className="block">
                      <span className="field-label">Shop-System</span>
                      <select className="field" name="shop_platform" value={shopFields.shop_platform} onChange={() => undefined}>
                        <option value="">Nicht hinterlegt</option>
                        {SHOP_PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="field-label">Hauptmarkt</span>
                      <select className="field" name="headquarters_country" value={shopFields.headquarters_country} onChange={() => undefined}>
                        {COUNTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="field-label">Standort / Stadt</span>
                      <input className="field" name="headquarters_city" value={shopFields.headquarters_city} placeholder="Berlin" onChange={() => undefined} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="field-label">Jahresumsatz E-Commerce</span>
                      <select className="field" name="annual_revenue_band" value={shopFields.annual_revenue_band} onChange={() => undefined}>
                        <option value="">Nicht hinterlegt</option>
                        {REVENUE_BAND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>
                </details>
                <LiveVerification items={[
                  { label: 'Shopname erkannt', state: !shopFields.shop_name ? 'waiting' : shopNameValid ? 'valid' : 'invalid' },
                  { label: 'Sichere Shop-URL', state: !shopFields.shop_url ? 'waiting' : shopUrlValid ? 'valid' : 'invalid' },
                  { label: 'Branche gewählt', state: industryValid ? 'valid' : 'waiting' },
                  { label: 'Größe gewählt', state: companySizeValid ? 'valid' : 'waiting' },
                ]} />
                {currentResult}
                <div className="flex justify-end border-t border-vault-700 pt-5">
                  <button className={`button-primary min-w-40 ${pending ? 'is-pending' : ''}`} disabled={pending || !shopReady}>{pending ? 'Wird gespeichert …' : 'Weiter zum Produkt →'}</button>
                </div>
              </form>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="product-heading" className="mt-5 animate-reveal">
              <p className="eyebrow">Dein Sortiment</p>
              <h2 id="product-heading" className="mt-3 text-2xl font-bold sm:text-3xl">Lege dein erstes Produkt an.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-vault-300">Der eigene Preis ist die Referenz für Abweichungen und spätere Alarme.</p>
              <form
                onSubmit={submitProduct}
                onChange={(event) => {
                  const target = event.target
                  if (!(target instanceof HTMLInputElement)) return
                  setProductFields((current) => ({ ...current, [target.name]: target.value }))
                }}
                className="mt-9 space-y-5"
              >
                <label className="block">
                  <span className="field-label">Produktname</span>
                  <input className={fieldState(productFields.name, productNameValid)} name="name" required autoFocus value={productFields.name} aria-invalid={Boolean(productFields.name) && !productNameValid} placeholder="z. B. Mars Hydro SP3000" onChange={() => undefined} />
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Artikelnummer (optional)</span>
                    <input className="field" name="our_sku" placeholder="SKU-1001" />
                  </label>
                  <label className="block">
                    <span className="field-label">Dein Preis in EUR</span>
                    <input
                      className={fieldState(productFields.our_price, productPriceValid)}
                      name="our_price"
                      inputMode="decimal"
                      value={productFields.our_price}
                      aria-invalid={Boolean(productFields.our_price) && !productPriceValid}
                      placeholder="199,00"
                      onBlur={() => {
                        setProductFields((current) => ({ ...current, our_price: formatPriceInput(current.our_price) }))
                      }}
                      onChange={() => undefined}
                    />
                  </label>
                </div>
                <LiveVerification items={[
                  { label: 'Produktname erkannt', state: !productFields.name ? 'waiting' : productNameValid ? 'valid' : 'invalid' },
                  { label: 'Preisformat gültig', state: productPriceValid ? 'valid' : 'invalid' },
                ]} />
                {currentResult}
                <div className="flex flex-col-reverse gap-3 border-t border-vault-700 pt-5 sm:flex-row sm:justify-between">
                  <button type="button" className="button-secondary" onClick={() => { setResult(null); setStep(1) }}>← Zurück</button>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {products.length > 0 && <button type="button" className="button-secondary" onClick={() => { setResult(null); setStep(3) }}>Vorhandenes verwenden</button>}
                    <button className={`button-primary min-w-40 ${pending ? 'is-pending' : ''}`} disabled={pending || !productReady}>{pending ? 'Wird gespeichert …' : 'Produkt speichern →'}</button>
                  </div>
                </div>
              </form>
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="source-heading" className="mt-5 animate-reveal">
              <p className="eyebrow">Marktquelle</p>
              <h2 id="source-heading" className="mt-3 text-2xl font-bold sm:text-3xl">Verbinde einen Mitbewerber.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-vault-300">PriceVault ruft die Produktseite regelmäßig ab und stellt den gefundenen Preis deiner Referenz gegenüber.</p>
              <form
                onSubmit={submitSource}
                onChange={(event) => {
                  const target = event.target
                  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return
                  setSourceFields((current) => ({ ...current, [target.name]: target.value }))
                }}
                className="mt-9 space-y-5"
              >
                <input type="hidden" name="product_id" value={sourceFields.product_id} />
                <div className="panel px-4 py-3">
                  <span className="field-label">Produkt aus Schritt 02</span>
                  <div className="flex items-center justify-between gap-4">
                    <p className="min-w-0 truncate text-sm font-semibold text-vault-100">
                      {selectedProduct?.name ?? 'Erstes Produkt'}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] uppercase text-merchant-success">
                      übernommen
                    </span>
                  </div>
                </div>

                {initialCompetitors.length > 0 && (
                  <div className="grid grid-cols-2 gap-2" aria-label="Mitbewerber auswählen">
                    <button type="button" onClick={() => setCompetitorMode('existing')} className={competitorMode === 'existing' ? 'button-primary' : 'button-secondary'}>Vorhandener Shop</button>
                    <button type="button" onClick={() => setCompetitorMode('new')} className={competitorMode === 'new' ? 'button-primary' : 'button-secondary'}>Neuer Shop</button>
                  </div>
                )}

                {competitorMode === 'existing' ? (
                  <label className="block">
                    <span className="field-label">Mitbewerber</span>
                    <select className={fieldState(sourceFields.competitor_id, Boolean(sourceFields.competitor_id))} name="competitor_id" required value={sourceFields.competitor_id} onChange={() => undefined}>
                      {initialCompetitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.shop_name}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block">
                      <span className="field-label">Name des Mitbewerbers</span>
                      <input className={fieldState(sourceFields.shop_name, sourceFields.shop_name.trim().length >= 2)} name="shop_name" required value={sourceFields.shop_name} placeholder="Beispiel Shop" onChange={() => undefined} />
                    </label>
                    <label className="block">
                      <span className="field-label">Basis-URL</span>
                      <input className={fieldState(sourceFields.base_url, isHttpUrl(sourceFields.base_url))} name="base_url" type="url" required value={sourceFields.base_url} placeholder="https://beispiel-shop.de" onChange={() => undefined} />
                    </label>
                  </div>
                )}

                <label className="block">
                  <span className="field-label">Produkt-URL beim Mitbewerber</span>
                  <input className={fieldState(sourceFields.competitor_url, sourceUrlValid)} name="competitor_url" type="url" required value={sourceFields.competitor_url} placeholder="https://beispiel-shop.de/produkt" onChange={() => undefined} />
                </label>
                <label className="block">
                  <span className="field-label">Preis-Selektor (optional)</span>
                  <input className="field font-mono" name="selector_price" placeholder=".product-price" />
                  <span className="mt-2 block text-xs leading-5 text-vault-500">Ohne Selektor versucht der Scraper, den Preis automatisch zu erkennen.</span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-vault-700 bg-vault-950 p-3 text-sm leading-5 text-vault-300">
                  <input className="mt-1" name="customer_authorized" type="checkbox" required />
                  <span>Ich bestätige die Berechtigung meines Unternehmens zum Abruf dieser öffentlichen Preisquelle. PriceVault beachtet robots.txt und blockiert fremde Weiterleitungsziele.</span>
                </label>
                <LiveVerification items={[
                  { label: 'Produkt übernommen', state: sourceProductValid ? 'valid' : 'waiting' },
                  { label: 'Mitbewerber vollständig', state: sourceCompetitorValid ? 'valid' : 'waiting' },
                  { label: 'Produkt-URL gültig', state: !sourceFields.competitor_url ? 'waiting' : sourceUrlValid ? 'valid' : 'invalid' },
                ]} />
                {currentResult}
                <div className="flex flex-col-reverse gap-3 border-t border-vault-700 pt-5 sm:flex-row sm:justify-between">
                  <button type="button" className="button-secondary" onClick={() => { setResult(null); setStep(2) }}>← Zurück</button>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button type="button" className="button-secondary" onClick={() => { setResult(null); setStep(4) }}>Später einrichten</button>
                    <button className={`button-primary min-w-40 ${pending ? 'is-pending' : ''}`} disabled={pending || !products.length || !sourceReady}>{pending ? 'Wird verbunden …' : 'Quelle verbinden →'}</button>
                  </div>
                </div>
              </form>
            </section>
          )}

          {step === 4 && (
            <section aria-labelledby="done-heading" className="mt-5 animate-reveal">
              <div className="onboarding-success-mark grid h-14 w-14 place-items-center rounded-lg border border-emerald-300 bg-emerald-100 text-2xl text-merchant-success">✓</div>
              <p className="eyebrow mt-8">Einrichtung abgeschlossen</p>
              <h2 id="done-heading" className="mt-3 text-2xl font-bold sm:text-3xl">Dein PriceVault ist bereit.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-vault-300">Im Dashboard siehst du nach dem ersten erfolgreichen Abruf die aktuellen Preisabstände. Weitere Produkte, Quellen und Alarme kannst du jederzeit ergänzen.</p>
              <div className="panel mt-9 grid gap-px overflow-hidden bg-vault-700 sm:grid-cols-3">
                {[
                  ['01', 'Produkte ergänzen'],
                  ['02', 'Preisquellen prüfen'],
                  ['03', 'Alarme aktivieren'],
                ].map(([mark, label]) => (
                  <div key={mark} className="onboarding-summary-card bg-vault-900 p-5">
                    <span className="font-mono text-[10px] text-merchant-success">{mark}</span>
                    <p className="mt-2 text-sm font-semibold">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex flex-col gap-3 border-t border-vault-700 pt-6 sm:flex-row sm:justify-between">
                <button type="button" className="button-secondary" onClick={() => { setResult(null); setStep(3) }}>← Zurück</button>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {accountSetupHint && <Link href="/dashboard" className="button-secondary min-w-44">Dashboard öffnen</Link>}
                  <Link href={postSetupHref} className="button-primary min-w-44">{accountSetupHint ? 'Passwort erstellen →' : 'Dashboard öffnen →'}</Link>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
