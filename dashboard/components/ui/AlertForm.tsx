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
  const [condition, setCondition] = useState(alert?.condition ?? 'below_pct')
  const needsThreshold = !['out_of_stock', 'back_in_stock'].includes(condition)
  const supportsUnits = ['price_drop', 'price_rise'].includes(condition)

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
          <select className="field" name="condition" value={condition} onChange={(event) => setCondition(event.target.value as Alert['condition'])}>
            <option value="below_pct">Mitbewerber ist günstiger um mehr als (%)</option>
            <option value="above_pct">Mitbewerber ist teurer um mehr als (%)</option>
            <option value="below_abs">Mitbewerber ist günstiger um mehr als (€)</option>
            <option value="above_abs">Mitbewerber ist teurer um mehr als (€)</option>
            <option value="undercut_abs">Mitbewerber unterbietet dich um (€)</option>
            <option value="price_drop">Mitbewerber senkt seinen Preis</option>
            <option value="price_rise">Mitbewerber erhöht seinen Preis</option>
            <option value="out_of_stock">Quelle ist nicht mehr verfügbar</option>
            <option value="back_in_stock">Quelle ist wieder verfügbar</option>
            <option value="source_broken">Preisquelle schlägt wiederholt fehl</option>
          </select>
        </label>
        {needsThreshold ? (
          <label>
            <span className="field-label">{condition === 'source_broken' ? 'Fehler in Folge' : 'Grenzwert'}</span>
            <input
              key={condition}
              className="field"
              name="threshold"
              type="number"
              min={condition === 'source_broken' ? 1 : 0.01}
              step={condition === 'source_broken' ? 1 : 0.01}
              required
              defaultValue={alert?.threshold ?? (condition === 'source_broken' ? 3 : 10)}
            />
          </label>
        ) : (
          <input type="hidden" name="threshold" value="" />
        )}
      </div>

      {supportsUnits && (
        <label>
          <span className="field-label">Schwellenwert als</span>
          <select className="field" name="threshold_unit" defaultValue={alert?.threshold_unit ?? 'percent'}>
            <option value="percent">Prozentuale Änderung</option>
            <option value="absolute">Absoluter Betrag in Euro</option>
          </select>
        </label>
      )}
      {!supportsUnits && <input type="hidden" name="threshold_unit" value="absolute" />}

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
        <p className={`text-sm ${result.ok ? 'text-merchant-success' : 'text-red-700'}`} aria-live="polite">
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
