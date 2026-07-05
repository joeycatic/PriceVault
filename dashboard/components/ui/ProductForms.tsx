'use client'

import { Building2, Check, ExternalLink, Globe2, MapPin, Save, Store } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  INDUSTRY_OPTIONS,
  REVENUE_BAND_OPTIONS,
  SHOP_PLATFORM_OPTIONS,
} from '@/lib/company-profile'
import type { Competitor, Product, ProductVariant, Tenant } from '@/lib/types'
import { formatPriceInput } from '@/lib/priceInput'

type ActionResult = { ok: boolean; message: string }
export type CatalogCandidate = {
  name: string
  url: string
  sku: string | null
  gtin: string | null
  price: number | null
  currency: string
  source: string
  duplicate?: boolean
  duplicate_reason?: string | null
}
type CatalogDiscoveryResult = ActionResult & { products?: CatalogCandidate[]; duplicateCount?: number }

function CatalogCheckbox({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <span className="relative inline-grid h-6 w-6 shrink-0 place-items-center">
      <input
        type="checkbox"
        className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-md"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="pointer-events-none grid h-5 w-5 place-items-center rounded-md border border-vault-600 bg-white text-white shadow-sm transition peer-checked:border-vault-100 peer-checked:bg-vault-100 peer-disabled:border-vault-700 peer-disabled:bg-vault-800 peer-focus-visible:ring-2 peer-focus-visible:ring-vault-100 peer-focus-visible:ring-offset-2">
        <Check className={`h-3.5 w-3.5 transition ${checked ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`} strokeWidth={3} aria-hidden="true" />
      </span>
    </span>
  )
}

function ResultMessage({ result }: { result: ActionResult | null }) {
  if (!result) return null
  return (
    <p className={`text-sm ${result.ok ? 'text-merchant-success' : 'text-red-700'}`} role={result.ok ? 'status' : 'alert'}>
      {result.message}
    </p>
  )
}

export function ProductForm({ action }: { action: (formData: FormData) => Promise<ActionResult> }) {
  const ref = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setResult(null)
    startTransition(async () => {
      const next = await action(formData)
      setResult(next)
      if (next.ok) ref.current?.reset()
    })
  }

  return (
    <form ref={ref} onSubmit={submit} className="space-y-4">
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
          <input
            className="field"
            name="our_price"
            inputMode="decimal"
            placeholder="199,00"
            onBlur={(event) => {
              event.currentTarget.value = formatPriceInput(event.currentTarget.value)
            }}
          />
        </label>
      </div>
      <ResultMessage result={result} />
      <button className="button-primary w-full sm:w-auto" disabled={pending}>
        {pending ? 'Wird angelegt …' : 'Produkt anlegen'}
      </button>
    </form>
  )
}

export function CompanyForm({
  action,
  tenant,
}: {
  action: (formData: FormData) => Promise<ActionResult>
  tenant: Tenant
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setResult(null)
    startTransition(async () => {
      setResult(await action(formData))
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-xl border border-vault-700 bg-vault-950/70 p-4" aria-labelledby="company-core-fields">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white shadow-sm">
            <Store className="h-4 w-4 text-vault-100" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-vault-500">Identität</p>
            <h3 id="company-core-fields" className="mt-1 font-semibold">Shop und Rechtsträger</h3>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="field-label">Firmen- / Shopname <span className="text-red-600" aria-label="Pflichtfeld">*</span></span>
            <input className="field" name="shop_name" required defaultValue={tenant.shop_name} />
          </label>
          <label>
            <span className="field-label">Shop-URL <span className="text-red-600" aria-label="Pflichtfeld">*</span></span>
            <input className="field" name="shop_url" type="url" required defaultValue={tenant.shop_url} />
          </label>
          <label>
            <span className="field-label">Rechtlicher Firmenname <span className="font-normal text-vault-500">(optional)</span></span>
            <input className="field" name="company_legal_name" defaultValue={tenant.company_legal_name ?? ''} placeholder="Muster GmbH" />
          </label>
          <label>
            <span className="field-label">USt-IdNr. <span className="font-normal text-vault-500">(optional)</span></span>
            <input className="field font-mono" name="vat_id" defaultValue={tenant.vat_id ?? ''} placeholder="DE123456789" />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-vault-700 bg-white p-4" aria-labelledby="company-market-fields">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-vault-950 shadow-sm">
            <Building2 className="h-4 w-4 text-vault-100" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-vault-500">Marktkontext</p>
            <h3 id="company-market-fields" className="mt-1 font-semibold">Branche, Größe und Plattform</h3>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="field-label">Branche <span className="text-red-600" aria-label="Pflichtfeld">*</span></span>
            <select className="field" name="industry" required defaultValue={tenant.industry ?? ''}>
              <option value="" disabled>Branche wählen</option>
              {INDUSTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">Unternehmensgröße <span className="text-red-600" aria-label="Pflichtfeld">*</span></span>
            <select className="field" name="company_size" required defaultValue={tenant.company_size ?? ''}>
              <option value="" disabled>Größe wählen</option>
              {COMPANY_SIZE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">Shop-System <span className="font-normal text-vault-500">(optional)</span></span>
            <select className="field" name="shop_platform" defaultValue={tenant.shop_platform ?? ''}>
              <option value="">Nicht hinterlegt</option>
              {SHOP_PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">Jahresumsatz E-Commerce <span className="font-normal text-vault-500">(optional)</span></span>
            <select className="field" name="annual_revenue_band" defaultValue={tenant.annual_revenue_band ?? ''}>
              <option value="">Nicht hinterlegt</option>
              {REVENUE_BAND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-vault-700 bg-white p-4" aria-labelledby="company-location-fields">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-vault-950 shadow-sm">
            <MapPin className="h-4 w-4 text-vault-100" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-vault-500">Standort</p>
            <h3 id="company-location-fields" className="mt-1 font-semibold">Hauptmarkt und Sitz</h3>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="field-label">Hauptmarkt <span className="text-red-600" aria-label="Pflichtfeld">*</span></span>
            <select className="field" name="headquarters_country" defaultValue={tenant.headquarters_country ?? 'DE'}>
              {COUNTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">Standort / Stadt <span className="font-normal text-vault-500">(optional)</span></span>
            <input className="field" name="headquarters_city" defaultValue={tenant.headquarters_city ?? ''} placeholder="Berlin" />
          </label>
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-vault-700 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <ResultMessage result={result} />
          {!result && (
            <p className="flex items-center gap-2 text-xs text-vault-500">
              <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
              Änderungen wirken sich auf Navigation, Reports und Onboarding-Kontext aus.
            </p>
          )}
        </div>
        <button className="button-primary gap-2" disabled={pending}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {pending ? 'Wird gespeichert …' : 'Unternehmen speichern'}
        </button>
      </div>
    </form>
  )
}

export function ProductImportForm({ action }: { action: (formData: FormData) => Promise<ActionResult> }) {
  const ref = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setResult(null)
    startTransition(async () => {
      const next = await action(formData)
      setResult(next)
      if (next.ok) ref.current?.reset()
    })
  }

  return (
    <form ref={ref} onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-vault-700 bg-vault-950/70 p-4">
          <p className="text-sm font-semibold">CSV einfügen</p>
          <p className="mt-1 text-xs leading-5 text-vault-500">Eine Zeile pro Produkt. Unterstützt Komma, Semikolon oder Tab.</p>
        </div>
        <div className="rounded-lg border border-vault-700 bg-vault-950/70 p-4">
          <p className="text-sm font-semibold">CSV-Datei hochladen</p>
          <p className="mt-1 text-xs leading-5 text-vault-500">Spalten: Name, SKU, Preis. Kopfzeile ist optional.</p>
        </div>
      </div>
      <label>
        <span className="field-label">Produkte einfügen</span>
        <textarea
          className="field min-h-36 font-mono"
          name="products_csv"
          placeholder={'name;sku;price\nMars Hydro SP3000;MH-SP3000;199,00\nLumatek ATS 300W;LUM-300;279,90'}
        />
      </label>
      <label>
        <span className="field-label">Oder CSV-Datei</span>
        <input className="field file:mr-4 file:rounded-md file:border-0 file:bg-vault-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white" name="products_file" type="file" accept=".csv,text/csv,text/plain" />
      </label>
      <ResultMessage result={result} />
      <button className="button-primary w-full sm:w-auto" disabled={pending}>
        {pending ? 'Import läuft …' : 'Produkte importieren'}
      </button>
    </form>
  )
}

export function PublicCatalogImportForm({
  discoverAction,
  importAction,
}: {
  discoverAction: (formData: FormData) => Promise<CatalogDiscoveryResult>
  importAction: (formData: FormData) => Promise<ActionResult>
}) {
  const [pending, startTransition] = useTransition()
  const [products, setProducts] = useState<CatalogCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<CatalogDiscoveryResult | null>(null)

  function discover(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    startTransition(async () => {
      const next = await discoverAction(new FormData(event.currentTarget))
      const found = next.products ?? []
      setProducts(found)
      setSelected(new Set(found.filter((product) => !product.duplicate).map((product) => product.url)))
      setResult(next)
    })
  }

  function importSelected() {
    const chosen = products.filter((product) => selected.has(product.url))
    const data = new FormData()
    data.set('products', JSON.stringify(chosen))
    setResult(null)
    startTransition(async () => {
      const next = await importAction(data)
      setResult(next)
      if (next.ok) {
        setProducts([])
        setSelected(new Set())
      }
    })
  }

  function toggle(url: string) {
    if (products.find((product) => product.url === url)?.duplicate) return
    setSelected((current) => {
      const next = new Set(current)
      next.has(url) ? next.delete(url) : next.add(url)
      return next
    })
  }

  const importableProducts = products.filter((product) => !product.duplicate)
  const duplicateCount = result?.duplicateCount ?? products.filter((product) => product.duplicate).length

  return (
    <div>
      <form onSubmit={discover} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
        <label>
          <span className="field-label">Shop-URL</span>
          <input className="field" name="base_url" type="text" required placeholder="https://dein-shop.de" />
        </label>
        <label>
          <span className="field-label">Maximal erkennen</span>
          <input className="field" name="max_products" type="number" min="1" max="250" defaultValue="50" required />
        </label>
        <button className="button-primary" disabled={pending}>{pending ? 'Shop wird geprüft …' : 'Produkte erkennen'}</button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ResultMessage result={result} />
        {products.length > 0 && duplicateCount > 0 && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {duplicateCount} bereits vorhanden
          </span>
        )}
      </div>

      {products.length > 0 && (
        <div className="mt-6 border-t border-vault-700 pt-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
              <CatalogCheckbox
                checked={importableProducts.length > 0 && selected.size === importableProducts.length}
                disabled={!importableProducts.length}
                label={`Alle ${importableProducts.length} neuen Produkte auswählen`}
                onChange={(checked) => setSelected(checked ? new Set(importableProducts.map((product) => product.url)) : new Set())}
              />
              <span>Alle {importableProducts.length} neuen Produkte auswählen</span>
            </label>
            <button type="button" className="button-secondary" disabled={pending || !selected.size} onClick={importSelected}>
              {pending ? 'Import läuft …' : `${selected.size} ausgewählte importieren`}
            </button>
          </div>
          <div className="catalog-scrollbar mt-4 max-h-[520px] divide-y divide-vault-700 overflow-y-auto border-y border-vault-700 pr-2">
            {products.map((product) => (
              <div key={product.url} className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] ${product.duplicate ? 'bg-amber-50/80' : ''}`}>
                <CatalogCheckbox checked={selected.has(product.url)} disabled={product.duplicate} label={`${product.name} auswählen`} onChange={() => toggle(product.url)} />
                <button type="button" disabled={product.duplicate} onClick={() => toggle(product.url)} className="min-w-0 text-left disabled:cursor-default">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-vault-100">{product.name}</span>
                    {product.duplicate && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Vorhanden</span>}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[10px] text-vault-500">{product.sku ?? 'Keine SKU'}</span>
                  {product.duplicate_reason && <span className="mt-1 block text-[10px] font-medium text-amber-800">Treffer über {product.duplicate_reason}</span>}
                </button>
                <span className="font-mono text-sm font-semibold">{product.price === null ? 'Preis offen' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: product.currency || 'EUR' }).format(product.price)}</span>
                <a
                  href={product.url}
                  target="_blank"
                  rel="noreferrer"
                  className="col-start-2 inline-flex h-9 items-center justify-center gap-2 justify-self-start rounded-lg border border-vault-700 bg-white px-3 text-xs font-semibold text-vault-300 shadow-sm transition hover:border-vault-500 hover:bg-vault-800 hover:text-vault-100 sm:col-start-auto"
                  aria-label={`Produktseite von ${product.name} öffnen`}
                  title="Produktseite öffnen"
                >
                  <span>Öffnen</span>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function VariantForm({
  action,
  products,
}: {
  action: (formData: FormData) => Promise<ActionResult>
  products: Product[]
}) {
  const ref = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setResult(null)
    startTransition(async () => {
      const next = await action(formData)
      setResult(next)
      if (next.ok) ref.current?.reset()
    })
  }

  return (
    <form ref={ref} onSubmit={submit} className="space-y-4">
      <label>
        <span className="field-label">Produkt</span>
        <select className="field" name="product_id" required defaultValue="">
          <option value="" disabled>Produkt wählen</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Variantenname</span>
          <input className="field" name="name" required placeholder="Größe L / Schwarz" />
        </label>
        <label>
          <span className="field-label">SKU</span>
          <input className="field" name="sku" placeholder="SKU-1001-L-BLK" />
        </label>
      </div>
      <label>
        <span className="field-label">GTIN / EAN</span>
        <input className="field font-mono" name="gtin" inputMode="numeric" pattern="[0-9]{8}|[0-9]{12,14}" placeholder="Optional" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Verkaufspreis</span>
          <input className="field" name="our_price" inputMode="decimal" placeholder="199,00" />
        </label>
        <label>
          <span className="field-label">Einstandspreis</span>
          <input className="field" name="cost_price" inputMode="decimal" placeholder="120,00" />
        </label>
      </div>
      <ResultMessage result={result} />
      <button className="button-primary" disabled={pending || !products.length}>
        {pending ? 'Wird angelegt …' : 'Variante anlegen'}
      </button>
    </form>
  )
}

export function MappingForm({
  action,
  products,
  variants,
  competitors,
}: {
  action: (formData: FormData) => Promise<ActionResult>
  products: Product[]
  variants: ProductVariant[]
  competitors: Competitor[]
}) {
  const ref = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setResult(null)
    startTransition(async () => {
      const next = await action(formData)
      setResult(next)
      if (next.ok) ref.current?.reset()
    })
  }

  return (
    <form ref={ref} onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Produkt</span>
          <select className="field" name="product_id" required defaultValue="">
            <option value="" disabled>Produkt wählen</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">Variante</span>
          <select className="field" name="variant_id" required defaultValue="">
            <option value="" disabled>Variante wählen</option>
            {variants.map((variant) => {
              const product = products.find((item) => item.id === variant.product_id)
              return <option key={variant.id} value={variant.id}>{product?.name ?? 'Produkt'} · {variant.name}</option>
            })}
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
        <span className="mt-2 block text-xs leading-5 text-vault-500">
          Diese URL wird nach dem beim Mitbewerber gewählten Intervall geprüft. Ein manueller Abruf ist jederzeit möglich.
        </span>
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
      <label className="flex items-start gap-3 rounded-lg border border-vault-700 bg-vault-950 p-3 text-sm leading-5 text-vault-300">
        <input className="mt-1" name="customer_authorized" type="checkbox" required />
        <span>Ich bestätige, dass mein Unternehmen zum Abruf dieser öffentlich erreichbaren Preisquelle berechtigt ist. PriceVault prüft zusätzlich robots.txt und blockiert nicht freigegebene Hosts.</span>
      </label>
      <ResultMessage result={result} />
      <button className="button-primary w-full sm:w-auto" disabled={pending || !products.length || !competitors.length}>
        {pending ? 'Wird gespeichert …' : 'Zuordnung speichern'}
      </button>
    </form>
  )
}

export function MatchSuggestionForm({
  action,
  products,
  variants,
  competitors,
}: {
  action: (formData: FormData) => Promise<ActionResult>
  products: Product[]
  variants: ProductVariant[]
  competitors: Competitor[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const next = await action(formData)
      setResult(next)
      if (next.ok) router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label>
        <span className="field-label">Produktvariante</span>
        <select className="field" name="variant_id" required defaultValue="">
          <option value="" disabled>Variante wählen</option>
          {variants.map((variant) => {
            const product = products.find((item) => item.id === variant.product_id)
            const identifier = variant.gtin ? ` · GTIN ${variant.gtin}` : ''
            return <option key={variant.id} value={variant.id}>{product?.name ?? 'Produkt'} · {variant.name}{identifier}</option>
          })}
        </select>
      </label>
      <label>
        <span className="field-label">Mitbewerber</span>
        <select className="field" name="competitor_id" required defaultValue="">
          <option value="" disabled>Shop wählen</option>
          {competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.shop_name}</option>)}
        </select>
      </label>
      <p className="text-xs leading-5 text-vault-500">
        Mit GTIN/EAN wird die Kennung gesucht. Ohne Kennung erstellt PriceVault Vorschläge anhand des Produktnamens.
      </p>
      <ResultMessage result={result} />
      <button className="button-secondary" disabled={pending || !variants.length || !competitors.length}>
        {pending ? 'Suche läuft …' : 'Vorschläge suchen'}
      </button>
    </form>
  )
}
