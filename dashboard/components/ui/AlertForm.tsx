'use client'

import { useState, useTransition } from 'react'

import type { Alert, Competitor, Product } from '@/lib/types'

type ActionResult = { ok: boolean; message: string }

export function AlertForm({
  alert,
  products,
  competitors,
  saveAction,
}: {
  alert?: Alert
  products: Product[]
  competitors: Competitor[]
  saveAction: (formData: FormData) => Promise<ActionResult>
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setResult(null)
    startTransition(async () => setResult(await saveAction(formData)))
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {alert && <input type="hidden" name="id" value={alert.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Produkt</span>
          <select className="field" name="product_id" defaultValue={alert?.product_id ?? ''}>
            <option value="">Alle Produkte</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">Mitbewerber</span>
          <select className="field" name="competitor_id" defaultValue={alert?.competitor_id ?? ''}>
            <option value="">Alle Mitbewerber</option>
            {competitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.shop_name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <label>
          <span className="field-label">Bedingung</span>
          <select className="field" name="condition" defaultValue={alert?.condition ?? 'below_pct'}>
            <option value="below_pct">Mitbewerber ist günstiger um mehr als (%)</option>
            <option value="above_pct">Mitbewerber ist teurer um mehr als (%)</option>
            <option value="below_abs">Mitbewerber ist günstiger um mehr als (€)</option>
            <option value="above_abs">Mitbewerber ist teurer um mehr als (€)</option>
          </select>
        </label>
        <label>
          <span className="field-label">Grenzwert</span>
          <input className="field" name="threshold" type="number" min="0.01" step="0.01" required defaultValue={alert?.threshold ?? 10} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <label>
          <span className="field-label">Benachrichtigungs-E-Mail</span>
          <input className="field" name="notify_email" type="email" required defaultValue={alert?.notify_email} placeholder="einkauf@unternehmen.de" />
        </label>
        <label>
          <span className="field-label">Ruhezeit</span>
          <select className="field" name="cooldown_h" defaultValue={alert?.cooldown_h ?? 24}>
            <option value="6">6 Stunden</option>
            <option value="12">12 Stunden</option>
            <option value="24">24 Stunden</option>
            <option value="48">48 Stunden</option>
          </select>
        </label>
      </div>

      {result && (
        <p className={`text-sm ${result.ok ? 'text-vault-lime' : 'text-red-300'}`} aria-live="polite">
          {result.message}
        </p>
      )}
      <div className="flex justify-end border-t border-vault-700 pt-4">
        <button className="button-primary" disabled={pending}>
          {pending ? 'Wird gespeichert …' : alert ? 'Preisalarm aktualisieren' : 'Preisalarm anlegen'}
        </button>
      </div>
    </form>
  )
}

