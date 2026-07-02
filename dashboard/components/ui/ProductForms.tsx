'use client'

import { useRef, useState, useTransition } from 'react'

import type { Competitor, Product } from '@/lib/types'
import { formatPriceInput } from '@/lib/priceInput'

type ActionResult = { ok: boolean; message: string }

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
  shopName,
  shopUrl,
}: {
  action: (formData: FormData) => Promise<ActionResult>
  shopName: string
  shopUrl: string
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
    <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label>
        <span className="field-label">Firmen- / Shopname</span>
        <input className="field" name="shop_name" required defaultValue={shopName} />
      </label>
      <label>
        <span className="field-label">Shop-URL</span>
        <input className="field" name="shop_url" type="url" required defaultValue={shopUrl} />
      </label>
      <div className="space-y-3 sm:col-span-2">
        <ResultMessage result={result} />
        <button className="button-secondary" disabled={pending}>
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

export function MappingForm({
  action,
  products,
  competitors,
}: {
  action: (formData: FormData) => Promise<ActionResult>
  products: Product[]
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
          Diese URL wird automatisch alle 12 Stunden geprüft. Du kannst den Abruf nach dem Speichern auch manuell starten.
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
      <ResultMessage result={result} />
      <button className="button-primary w-full sm:w-auto" disabled={pending || !products.length || !competitors.length}>
        {pending ? 'Wird gespeichert …' : 'Zuordnung speichern'}
      </button>
    </form>
  )
}
