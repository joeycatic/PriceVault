'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import type { OnboardingResult } from '@/app/onboarding/actions'

type ProductOption = { id: string; name: string }
type CompetitorOption = { id: string; shop_name: string }

const steps = [
  { number: 1, label: 'Dein Shop', hint: 'Arbeitsbereich anlegen' },
  { number: 2, label: 'Erstes Produkt', hint: 'Eigenen Preis erfassen' },
  { number: 3, label: 'Preisquelle', hint: 'Mitbewerber verbinden' },
  { number: 4, label: 'Bereit', hint: 'Monitoring starten' },
]

export function OnboardingWizard({
  initialStep,
  initialShop,
  initialProducts,
  initialCompetitors,
  email,
  saveShop,
  saveProduct,
  saveSource,
}: {
  initialStep: number
  initialShop: { shop_name: string; shop_url: string } | null
  initialProducts: ProductOption[]
  initialCompetitors: CompetitorOption[]
  email: string
  saveShop: (formData: FormData) => Promise<OnboardingResult>
  saveProduct: (formData: FormData) => Promise<OnboardingResult>
  saveSource: (formData: FormData) => Promise<OnboardingResult>
}) {
  const router = useRouter()
  const [step, setStep] = useState(initialStep)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<OnboardingResult | null>(null)
  const [products, setProducts] = useState(initialProducts)
  const [competitorMode, setCompetitorMode] = useState(initialCompetitors.length ? 'existing' : 'new')

  function runAction(
    action: (formData: FormData) => Promise<OnboardingResult>,
    formData: FormData,
    onSuccess: (next: OnboardingResult) => void,
  ) {
    setResult(null)
    startTransition(async () => {
      const next = await action(formData)
      setResult(next)
      if (next.ok) {
        onSuccess(next)
        router.refresh()
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
      if (next.id && next.name) setProducts((current) => [...current, { id: next.id!, name: next.name! }])
      setStep(3)
    })
  }

  function submitSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    runAction(saveSource, new FormData(event.currentTarget), () => setStep(4))
  }

  const currentResult = result && (
    <p
      className={`border-l-2 px-4 py-3 text-sm ${
        result.ok
          ? 'border-vault-lime bg-vault-lime/5 text-vault-lime'
          : 'border-red-400 bg-red-400/5 text-red-200'
      }`}
      role={result.ok ? 'status' : 'alert'}
    >
      {result.message}
    </p>
  )

  return (
    <div className="grid min-h-screen lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="relative overflow-hidden border-b border-vault-700 bg-vault-900/95 p-6 sm:p-9 lg:border-b-0 lg:border-r lg:p-10">
        <div className="absolute -left-24 bottom-4 h-64 w-64 rounded-full bg-vault-lime/5 blur-3xl" />
        <Link href={initialShop ? '/dashboard' : '/'} className="relative flex items-center gap-3" aria-label="PriceVault">
          <span className="grid h-10 w-10 place-items-center bg-vault-lime text-sm font-black text-vault-950 shadow-lime">PV</span>
          <span className="font-bold tracking-tight">PriceVault</span>
        </Link>

        <div className="relative mt-12 hidden lg:block">
          <p className="eyebrow">Einrichtung</p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">In wenigen Schritten zum Marktüberblick.</h1>
          <p className="mt-4 text-sm leading-6 text-vault-300">Deine Angaben bleiben jederzeit im Dashboard bearbeitbar.</p>
        </div>

        <ol className="relative mt-8 grid grid-cols-4 gap-2 lg:mt-14 lg:grid-cols-1 lg:gap-1" aria-label="Fortschritt">
          {steps.map((item) => {
            const active = step === item.number
            const complete = step > item.number
            return (
              <li key={item.number} className="min-w-0">
                <button
                  type="button"
                  onClick={() => item.number <= step && setStep(item.number)}
                  disabled={item.number > step}
                  className={`flex w-full items-center gap-3 border px-3 py-3 text-left transition lg:px-4 ${
                    active
                      ? 'border-vault-lime/40 bg-vault-lime/10'
                      : complete
                        ? 'border-transparent text-vault-100 hover:border-vault-700 hover:bg-vault-800'
                        : 'border-transparent text-vault-500'
                  }`}
                  aria-current={active ? 'step' : undefined}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center border font-mono text-[10px] ${complete || active ? 'border-vault-lime text-vault-lime' : 'border-vault-700'}`}>
                    {complete ? '✓' : `0${item.number}`}
                  </span>
                  <span className="hidden min-w-0 lg:block">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-[11px] text-vault-500">{item.hint}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <p className="relative mt-8 hidden font-mono text-[10px] text-vault-500 lg:block">ANGEMELDET ALS<br />{email}</p>
      </aside>

      <main className="relative flex items-center px-5 py-12 sm:px-10 lg:px-16 xl:px-24">
        <div className="pointer-events-none absolute right-[8%] top-0 h-20 w-px bg-vault-lime/40" />
        <div className="w-full max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-vault-500">Schritt {String(step).padStart(2, '0')} / 04</p>

          {step === 1 && (
            <section aria-labelledby="shop-heading" className="mt-5 animate-reveal">
              <p className="eyebrow">Arbeitsbereich</p>
              <h2 id="shop-heading" className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Welchen Shop beobachtest du?</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-vault-300">Damit ordnen wir alle Produkte, Mitbewerber und Preisalarme eindeutig deinem Unternehmen zu.</p>
              <form onSubmit={submitShop} className="mt-9 space-y-5">
                <label>
                  <span className="field-label">Shopname</span>
                  <input className="field" name="shop_name" required autoFocus defaultValue={initialShop?.shop_name} placeholder="Mein Onlineshop" />
                </label>
                <label>
                  <span className="field-label">Shop-URL</span>
                  <input className="field" name="shop_url" type="url" required defaultValue={initialShop?.shop_url} placeholder="https://mein-shop.de" />
                </label>
                {currentResult}
                <div className="flex justify-end border-t border-vault-700 pt-5">
                  <button className="button-primary min-w-40" disabled={pending}>{pending ? 'Wird gespeichert …' : 'Weiter zum Produkt →'}</button>
                </div>
              </form>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="product-heading" className="mt-5 animate-reveal">
              <p className="eyebrow">Dein Sortiment</p>
              <h2 id="product-heading" className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Lege dein erstes Produkt an.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-vault-300">Der eigene Preis ist die Referenz für Abweichungen und spätere Alarme.</p>
              <form onSubmit={submitProduct} className="mt-9 space-y-5">
                <label>
                  <span className="field-label">Produktname</span>
                  <input className="field" name="name" required autoFocus placeholder="z. B. Mars Hydro SP3000" />
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label>
                    <span className="field-label">Artikelnummer (optional)</span>
                    <input className="field" name="our_sku" placeholder="SKU-1001" />
                  </label>
                  <label>
                    <span className="field-label">Dein Preis in EUR</span>
                    <input className="field" name="our_price" inputMode="decimal" placeholder="199,00" />
                  </label>
                </div>
                {currentResult}
                <div className="flex flex-col-reverse gap-3 border-t border-vault-700 pt-5 sm:flex-row sm:justify-between">
                  <button type="button" className="button-secondary" onClick={() => { setResult(null); setStep(1) }}>← Zurück</button>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {products.length > 0 && <button type="button" className="button-secondary" onClick={() => { setResult(null); setStep(3) }}>Vorhandenes verwenden</button>}
                    <button className="button-primary min-w-40" disabled={pending}>{pending ? 'Wird gespeichert …' : 'Produkt speichern →'}</button>
                  </div>
                </div>
              </form>
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="source-heading" className="mt-5 animate-reveal">
              <p className="eyebrow">Marktquelle</p>
              <h2 id="source-heading" className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Verbinde einen Mitbewerber.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-vault-300">PriceVault ruft die Produktseite regelmäßig ab und stellt den gefundenen Preis deiner Referenz gegenüber.</p>
              <form onSubmit={submitSource} className="mt-9 space-y-5">
                <label>
                  <span className="field-label">Dein Produkt</span>
                  <select className="field" name="product_id" required defaultValue={products.at(-1)?.id ?? ''}>
                    <option value="" disabled>Produkt wählen</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                </label>

                {initialCompetitors.length > 0 && (
                  <div className="grid grid-cols-2 gap-2" aria-label="Mitbewerber auswählen">
                    <button type="button" onClick={() => setCompetitorMode('existing')} className={competitorMode === 'existing' ? 'button-primary' : 'button-secondary'}>Vorhandener Shop</button>
                    <button type="button" onClick={() => setCompetitorMode('new')} className={competitorMode === 'new' ? 'button-primary' : 'button-secondary'}>Neuer Shop</button>
                  </div>
                )}

                {competitorMode === 'existing' ? (
                  <label>
                    <span className="field-label">Mitbewerber</span>
                    <select className="field" name="competitor_id" required defaultValue={initialCompetitors[0]?.id}>
                      {initialCompetitors.map((competitor) => <option key={competitor.id} value={competitor.id}>{competitor.shop_name}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label>
                      <span className="field-label">Name des Mitbewerbers</span>
                      <input className="field" name="shop_name" required placeholder="Beispiel Shop" />
                    </label>
                    <label>
                      <span className="field-label">Basis-URL</span>
                      <input className="field" name="base_url" type="url" required placeholder="https://beispiel-shop.de" />
                    </label>
                  </div>
                )}

                <label>
                  <span className="field-label">Produkt-URL beim Mitbewerber</span>
                  <input className="field" name="competitor_url" type="url" required placeholder="https://beispiel-shop.de/produkt" />
                </label>
                <label>
                  <span className="field-label">Preis-Selektor (optional)</span>
                  <input className="field font-mono" name="selector_price" placeholder=".product-price" />
                  <span className="mt-2 block text-xs leading-5 text-vault-500">Ohne Selektor versucht der Scraper, den Preis automatisch zu erkennen.</span>
                </label>
                {currentResult}
                <div className="flex flex-col-reverse gap-3 border-t border-vault-700 pt-5 sm:flex-row sm:justify-between">
                  <button type="button" className="button-secondary" onClick={() => { setResult(null); setStep(2) }}>← Zurück</button>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button type="button" className="button-secondary" onClick={() => { setResult(null); setStep(4) }}>Später einrichten</button>
                    <button className="button-primary min-w-40" disabled={pending || !products.length}>{pending ? 'Wird verbunden …' : 'Quelle verbinden →'}</button>
                  </div>
                </div>
              </form>
            </section>
          )}

          {step === 4 && (
            <section aria-labelledby="done-heading" className="mt-5 animate-reveal">
              <div className="grid h-14 w-14 place-items-center border border-vault-lime bg-vault-lime/10 text-2xl text-vault-lime">✓</div>
              <p className="eyebrow mt-8">Einrichtung abgeschlossen</p>
              <h2 id="done-heading" className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Dein PriceVault ist bereit.</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-vault-300">Im Dashboard siehst du nach dem ersten erfolgreichen Abruf die aktuellen Preisabstände. Weitere Produkte, Quellen und Alarme kannst du jederzeit ergänzen.</p>
              <div className="panel mt-9 grid gap-px overflow-hidden bg-vault-700 sm:grid-cols-3">
                {[
                  ['01', 'Produkte ergänzen'],
                  ['02', 'Preisquellen prüfen'],
                  ['03', 'Alarme aktivieren'],
                ].map(([mark, label]) => (
                  <div key={mark} className="bg-vault-900 p-5">
                    <span className="font-mono text-[10px] text-vault-lime">{mark}</span>
                    <p className="mt-2 text-sm font-semibold">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex flex-col gap-3 border-t border-vault-700 pt-6 sm:flex-row sm:justify-between">
                <button type="button" className="button-secondary" onClick={() => { setResult(null); setStep(3) }}>← Zurück</button>
                <Link href="/dashboard" className="button-primary min-w-44">Dashboard öffnen →</Link>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
