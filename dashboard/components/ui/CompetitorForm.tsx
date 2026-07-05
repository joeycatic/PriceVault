'use client'

import { AlertTriangle, CheckCircle2, Clock3, FlaskConical, Globe2, Radar, Save, WandSparkles, XCircle } from 'lucide-react'
import { useRef, useState, useTransition } from 'react'

import type { Competitor } from '@/lib/types'

type ActionResult = { ok: boolean; message: string }
type TestResult = {
  ok: boolean
  message: string
  price?: number | null
  rawPriceText?: string | null
}
type DetectResult = TestResult & {
  selector?: string
  candidates?: Array<{ selector: string; rawText: string; price: number; confidence: number }>
}

export function CompetitorForm({
  competitor,
  initialShopName = '',
  initialBaseUrl = '',
  minimumFrequency,
  saveAction,
  testAction,
  detectAction,
}: {
  competitor?: Competitor
  initialShopName?: string
  initialBaseUrl?: string
  minimumFrequency: number
  saveAction: (formData: FormData) => Promise<ActionResult>
  testAction: (input: {
    url: string
    selectorPrice: string
    selectorStock: string
  }) => Promise<TestResult>
  detectAction: (input: { url: string }) => Promise<DetectResult>
}) {
  const frequencies = [1, 6, 12, 24, 48, 168].filter(
    (frequency) => frequency >= minimumFrequency || frequency === competitor?.scrape_freq_h,
  )
  const formRef = useRef<HTMLFormElement>(null)
  const shopNameRef = useRef<HTMLInputElement>(null)
  const baseUrlRef = useRef<HTMLInputElement>(null)
  const priceSelectorRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null)
  const modeLabel = competitor ? 'Quelle bearbeiten' : 'Quelle erstellen'

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

  function detectSelector() {
    const form = formRef.current
    if (!form) return
    const formData = new FormData(form)
    const url = String(formData.get('base_url') ?? '')
    if (!url) {
      setDetectResult({ ok: false, message: 'Eine URL ist erforderlich.' })
      return
    }
    setDetectResult(null)
    setTestResult(null)
    startTransition(async () => {
      const next = await detectAction({ url })
      setDetectResult(next)
      if (next.ok && next.selector && priceSelectorRef.current) {
        priceSelectorRef.current.value = next.selector
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-5">
      <div className="rounded-xl border border-vault-700 bg-vault-950/70 p-4">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white shadow-sm">
            <Globe2 className="h-4 w-4 text-vault-100" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-vault-500">{modeLabel}</p>
            <h3 className="mt-1 font-semibold">Shopdaten</h3>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="field-label">Shopname <span className="text-red-600" aria-label="Pflichtfeld">*</span></span>
            <input ref={shopNameRef} className="field" name="shop_name" required defaultValue={competitor?.shop_name ?? initialShopName} placeholder="Beispiel Shop" />
          </label>
          <label>
            <span className="field-label">Basis- oder Produkt-URL <span className="text-red-600" aria-label="Pflichtfeld">*</span></span>
            <input ref={baseUrlRef} className="field" name="base_url" type="url" required defaultValue={competitor?.base_url ?? initialBaseUrl} placeholder="https://shop.de/produkt" />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-vault-700 bg-white p-4">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-vault-950 shadow-sm">
            <Radar className="h-4 w-4 text-vault-100" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-vault-500">Scraper-Konfiguration</p>
            <h3 className="mt-1 font-semibold">Selektoren und Intervall</h3>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <label>
            <span className="field-label">Preis-Selektor</span>
            <input ref={priceSelectorRef} className="field font-mono" name="selector_price" defaultValue={competitor?.selector_price ?? ''} placeholder=".product-price" />
            <span className="mt-2 block text-xs leading-5 text-vault-500">
              „Erkennen“ funktioniert am besten, wenn die URL direkt auf eine Produktseite zeigt.
            </span>
          </label>
          <label>
            <span className="field-label">Abrufintervall</span>
            <select className="field" name="scrape_freq_h" defaultValue={competitor?.scrape_freq_h ?? minimumFrequency}>
              {frequencies.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {frequency === 1 ? 'Stündlich' : `Alle ${frequency} Stunden`}
                </option>
              ))}
            </select>
            <span className="mt-2 flex items-center gap-1 text-xs text-vault-500">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Minimum: {minimumFrequency} Std.
            </span>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="field-label">Bestands-Selektor <span className="font-normal text-vault-500">(optional)</span></span>
          <input className="field font-mono" name="selector_stock" defaultValue={competitor?.selector_stock ?? ''} placeholder=".stock-status" />
        </label>
      </div>

      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          CSS-Selektoren können sich ändern, wenn der Shop sein Design aktualisiert. Teste den
          Selektor regelmäßig.
        </p>
      </div>

      {testResult && (
        <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${
          testResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
        }`} aria-live="polite">
          {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <p>
            <span className="font-semibold">{testResult.message}</span>
            {testResult.rawPriceText ? <span className="block text-xs opacity-75">Rohtext: {testResult.rawPriceText}</span> : null}
          </p>
        </div>
      )}
      {detectResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          detectResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
        }`} aria-live="polite">
          <p className="flex items-center gap-2 font-semibold">
            {detectResult.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
            {detectResult.message}
          </p>
          {detectResult.candidates?.length ? (
            <div className="mt-3 space-y-2">
              {detectResult.candidates.slice(0, 3).map((candidate) => (
                <button
                  key={candidate.selector}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-white/70 bg-white px-3 py-2 text-left font-mono text-xs text-vault-300 shadow-sm transition hover:border-vault-500"
                  onClick={() => {
                    if (priceSelectorRef.current) priceSelectorRef.current.value = candidate.selector
                  }}
                >
                  <span className="min-w-0 truncate">{candidate.selector}</span>
                  <span className="shrink-0 text-vault-500">{candidate.rawText}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {result && (
        <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${
          result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
        }`} aria-live="polite">
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <p className="font-semibold">{result.message}</p>
        </div>
      )}

      <div className="grid gap-2 border-t border-vault-700 pt-5 sm:grid-cols-3">
        <button type="button" className="button-secondary gap-2" onClick={detectSelector} disabled={pending}>
          <WandSparkles className="h-4 w-4" aria-hidden="true" />
          Erkennen
        </button>
        <button type="button" className="button-secondary gap-2" onClick={testSelector} disabled={pending}>
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          Testen
        </button>
        <button className="button-primary gap-2" disabled={pending}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {pending ? 'Wird gespeichert …' : competitor ? 'Änderungen speichern' : 'Mitbewerber anlegen'}
        </button>
      </div>
    </form>
  )
}
