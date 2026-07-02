'use client'

import { useRef, useState, useTransition } from 'react'

import type { Competitor } from '@/lib/types'

type ActionResult = { ok: boolean; message: string }
type TestResult = {
  ok: boolean
  message: string
  price?: number | null
  rawPriceText?: string | null
}

export function CompetitorForm({
  competitor,
  saveAction,
  testAction,
}: {
  competitor?: Competitor
  saveAction: (formData: FormData) => Promise<ActionResult>
  testAction: (input: {
    url: string
    selectorPrice: string
    selectorStock: string
  }) => Promise<TestResult>
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    const formData = new FormData(event.currentTarget)
    startTransition(async () => setResult(await saveAction(formData)))
  }

  function testSelector() {
    const form = formRef.current
    if (!form) return
    const formData = new FormData(form)
    const url = String(formData.get('base_url') ?? '')
    const selectorPrice = String(formData.get('selector_price') ?? '')
    if (!url || !selectorPrice) {
      setTestResult({ ok: false, message: 'URL und Preis-Selektor sind erforderlich.' })
      return
    }
    setTestResult(null)
    startTransition(async () => {
      setTestResult(
        await testAction({
          url,
          selectorPrice,
          selectorStock: String(formData.get('selector_stock') ?? ''),
        }),
      )
    })
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label>
          <span className="field-label">Shopname</span>
          <input className="field" name="shop_name" required defaultValue={competitor?.shop_name} placeholder="Beispiel Shop" />
        </label>
        <label>
          <span className="field-label">Basis-URL</span>
          <input className="field" name="base_url" type="url" required defaultValue={competitor?.base_url} placeholder="https://shop.de" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
        <label>
          <span className="field-label">Preis-Selektor</span>
          <input className="field font-mono" name="selector_price" defaultValue={competitor?.selector_price ?? ''} placeholder=".product-price" />
        </label>
        <label>
          <span className="field-label">Abrufintervall</span>
          <select className="field" name="scrape_freq_h" defaultValue={competitor?.scrape_freq_h ?? 12}>
            <option value="6">Alle 6 Stunden</option>
            <option value="12">Alle 12 Stunden</option>
            <option value="24">Alle 24 Stunden</option>
          </select>
        </label>
      </div>

      <label>
        <span className="field-label">Bestands-Selektor (optional)</span>
        <input className="field font-mono" name="selector_stock" defaultValue={competitor?.selector_stock ?? ''} placeholder=".stock-status" />
      </label>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
        CSS-Selektoren können sich ändern, wenn der Shop sein Design aktualisiert. Teste den
        Selektor regelmäßig.
      </div>

      {testResult && (
        <p className={`text-sm ${testResult.ok ? 'text-merchant-success' : 'text-red-700'}`} aria-live="polite">
          {testResult.message}
          {testResult.rawPriceText ? ` (${testResult.rawPriceText})` : ''}
        </p>
      )}
      {result && (
        <p className={`text-sm ${result.ok ? 'text-merchant-success' : 'text-red-700'}`} aria-live="polite">
          {result.message}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-vault-700 pt-5 sm:flex-row sm:justify-end">
        <button type="button" className="button-secondary" onClick={testSelector} disabled={pending}>
          Selektor testen
        </button>
        <button className="button-primary" disabled={pending}>
          {pending ? 'Wird gespeichert …' : competitor ? 'Änderungen speichern' : 'Mitbewerber anlegen'}
        </button>
      </div>
    </form>
  )
}
