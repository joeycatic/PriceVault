'use client'

import { useRef, useState, useTransition } from 'react'

import type { Competitor, Product } from '@/lib/types'

type ActionResult = { ok: boolean; message: string }

function ResultMessage({ result }: { result: ActionResult | null }) {
  if (!result) return null
  return (
    <p className={`text-sm ${result.ok ? 'text-vault-lime' : 'text-red-300'}`} role={result.ok ? 'status' : 'alert'}>
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
          <input className="field" name="our_price" inputMode="decimal" placeholder="199,00" />
        </label>
      </div>
      <ResultMessage result={result} />
      <button className="button-primary w-full sm:w-auto" disabled={pending}>
        {pending ? 'Wird angelegt …' : 'Produkt anlegen'}
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
