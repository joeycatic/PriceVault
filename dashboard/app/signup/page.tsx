'use client'

import { ArrowRight, Building2, Check, Store } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { useSupabase } from '@/components/providers/SupabaseProvider'
import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  INDUSTRY_OPTIONS,
  REVENUE_BAND_OPTIONS,
  SHOP_PLATFORM_OPTIONS,
} from '@/lib/company-profile'

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function requiredLabel(label: string) {
  return (
    <>
      {label} <span className="text-red-600" aria-label="Pflichtfeld">*</span>
    </>
  )
}

function optionalLabel(label: string) {
  return (
    <>
      {label} <span className="font-normal text-vault-500">(optional)</span>
    </>
  )
}

function passwordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
    password.length >= 12,
  ]
  const score = checks.filter(Boolean).length
  if (!password) return { score: 0, width: '0%', label: 'Noch kein Passwort', color: 'bg-vault-700', hint: 'Nutze mindestens 8 Zeichen.' }
  if (score <= 2) return { score, width: '33%', label: 'Schwach', color: 'bg-red-500', hint: 'Füge Großbuchstaben, Zahlen oder Sonderzeichen hinzu.' }
  if (score <= 4) return { score, width: '66%', label: 'Solide', color: 'bg-amber-500', hint: 'Sehr stark ab 12 Zeichen und gemischten Zeichen.' }
  return { score, width: '100%', label: 'Stark', color: 'bg-merchant-success', hint: 'Gutes Passwort.' }
}

function signupErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('already') || normalized.includes('registered') || normalized.includes('exists')) {
    return 'Für diese E-Mail existiert bereits ein Konto. Bitte einloggen oder Passwort zurücksetzen.'
  }
  if (normalized.includes('password')) {
    return 'Das Passwort erfüllt die Sicherheitsanforderungen nicht. Nutze mindestens 8 Zeichen.'
  }
  if (normalized.includes('email')) {
    return 'Die E-Mail-Adresse wurde nicht akzeptiert. Prüfe Schreibweise und Domain.'
  }
  if (normalized.includes('rate') || normalized.includes('too many')) {
    return 'Zu viele Registrierungsversuche. Bitte warte kurz und versuche es erneut.'
  }
  return `Das Konto konnte nicht erstellt werden: ${message}`
}

export default function SignupPage() {
  const router = useRouter()
  const { supabase } = useSupabase()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [companyLegalName, setCompanyLegalName] = useState('')
  const [shopName, setShopName] = useState('')
  const [shopUrl, setShopUrl] = useState('')
  const [industry, setIndustry] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [shopPlatform, setShopPlatform] = useState('')
  const [headquartersCountry, setHeadquartersCountry] = useState('DE')
  const [headquartersCity, setHeadquartersCity] = useState('')
  const [annualRevenueBand, setAnnualRevenueBand] = useState('')
  const [status, setStatus] = useState<'idle' | 'creating' | 'sent' | 'resending'>('idle')
  const [error, setError] = useState<string | null>(null)
  const redirectTo = typeof window === 'undefined' ? undefined : `${window.location.origin}/api/auth/callback`
  const strength = passwordStrength(password)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Bitte gib deinen Namen an.')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Bitte gib eine gültige E-Mail-Adresse an.')
      return
    }
    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }
    if (password !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.')
      return
    }
    if (!companyLegalName.trim() || !shopName.trim()) {
      setError('Bitte gib Unternehmen und Shopnamen an.')
      return
    }
    if (!isHttpUrl(shopUrl)) {
      setError('Bitte gib eine gültige Shop-URL mit https:// oder http:// an.')
      return
    }
    if (!industry || !companySize || !headquartersCountry) {
      setError('Bitte wähle Branche, Unternehmensgröße und Hauptmarkt aus.')
      return
    }

    setStatus('creating')
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          signup_company_legal_name: companyLegalName,
          signup_shop_name: shopName,
          signup_shop_url: shopUrl,
          signup_industry: industry,
          signup_company_size: companySize,
          signup_shop_platform: shopPlatform || null,
          signup_headquarters_country: headquartersCountry,
          signup_headquarters_city: headquartersCity || null,
          signup_annual_revenue_band: annualRevenueBand || null,
        },
        emailRedirectTo: redirectTo,
      },
    })
    if (signUpError) {
      setError(signupErrorMessage(signUpError.message))
      setStatus('idle')
      return
    }
    if (data.user?.identities && data.user.identities.length === 0) {
      setError('Für diese E-Mail existiert bereits ein Konto. Bitte einloggen oder Passwort zurücksetzen.')
      setStatus('idle')
      return
    }
    if (data.session) {
      router.replace('/onboarding')
      router.refresh()
      return
    }
    setStatus('sent')
  }

  async function resendConfirmation() {
    setError(null)
    setStatus('resending')
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    })
    if (resendError) {
      setError('Der Bestätigungslink konnte nicht erneut gesendet werden. Prüfe die Adresse oder nutze Login.')
      setStatus('sent')
      return
    }
    setStatus('sent')
  }

  return (
    <main className="grid min-h-screen place-items-center bg-vault-950 px-4 py-8">
      <section className="panel grid w-full max-w-5xl overflow-hidden p-0 lg:grid-cols-[0.78fr_1.22fr]">
        <aside className="relative overflow-hidden bg-vault-100 p-6 text-white sm:p-8">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-merchant-success/25 blur-3xl" aria-hidden="true" />
          <Link href="/" className="relative flex items-center gap-3" aria-label="PriceVault Start">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white font-black text-vault-100">PV</span>
            <span className="text-lg font-bold">PriceVault</span>
          </Link>
          <p className="relative mt-10 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Company Signup</p>
          <h1 className="relative mt-3 text-3xl font-bold tracking-[-0.04em]">Konto und Unternehmen anlegen.</h1>
          <p className="relative mt-3 text-sm leading-6 text-white/70">
            Wir erfassen die wichtigsten Firmendaten direkt beim Start und füllen damit dein Onboarding vor.
            Shop, Produkte und Preisquellen werden danach kontrolliert in der Einrichtung angelegt.
          </p>
          <ul className="relative mt-6 space-y-2.5 text-sm text-white/75">
            {['Nutzerkonto erstellen', 'Unternehmensprofil vorbereiten', 'Onboarding mit Shopdaten vorfüllen'].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10">
                  <Check className="h-3.5 w-3.5 text-merchant-success" aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </aside>

        <div className="p-6 sm:p-8">
        <div className="mb-7 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 lg:hidden" aria-label="PriceVault Start">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-vault-100 font-black text-white">PV</span>
            <span className="text-lg font-bold">PriceVault</span>
          </Link>
          <span className="hidden lg:block" />
          <Link href="/login" className="text-xs font-semibold text-vault-100 hover:underline">
            Einloggen
          </Link>
        </div>

        <p className="eyebrow">Unternehmenszugang</p>
        <h2 className="mt-2 text-2xl font-bold">Registrierung</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-vault-300">
          Erstelle dein Nutzerkonto und hinterlege die Basisdaten deines Shops. Die Angaben werden im nächsten Schritt übernommen.
        </p>

        {status === 'sent' || status === 'resending' ? (
          <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-5" aria-live="polite">
            <p className="font-semibold">E-Mail bestätigen</p>
            <p className="mt-1 text-sm leading-6 text-vault-300">
              Wenn die Adresse neu ist, wurde ein Bestätigungslink an {email} gesendet.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold">
              <button type="button" className="text-merchant-success hover:underline" onClick={resendConfirmation} disabled={status === 'resending'}>
                {status === 'resending' ? 'Wird erneut gesendet ...' : 'Link erneut senden'}
              </button>
              <Link href="/login" className="text-merchant-success hover:underline">
                Zum Login
              </Link>
              <Link href="/reset-password" className="text-merchant-success hover:underline">
                Passwort zurücksetzen
              </Link>
            </div>
            {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <fieldset className="rounded-xl border border-vault-700 bg-vault-950/70 p-3.5">
              <legend className="flex items-center gap-2 px-1 text-sm font-bold">
                <Building2 className="h-4 w-4 text-vault-500" aria-hidden="true" />
                Konto
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="field-label">{requiredLabel('Name')}</span>
                  <input className="field" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Vorname Nachname" />
                </label>
                <label>
                  <span className="field-label">{requiredLabel('E-Mail-Adresse')}</span>
                  <input className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@unternehmen.de" />
                </label>
                <label>
                  <span className="field-label">{requiredLabel('Passwort')}</span>
                  <input className="field" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mindestens 8 Zeichen" />
                  <div className="mt-2" aria-live="polite">
                    <div className="h-1.5 overflow-hidden rounded-full bg-vault-700">
                      <div className={`h-full rounded-full transition-all duration-500 ease-out ${strength.color}`} style={{ width: strength.width }} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
                      <span className="font-semibold text-vault-300">Stärke: {strength.label}</span>
                      <span className="text-vault-500">{strength.hint}</span>
                    </div>
                  </div>
                </label>
                <label>
                  <span className="field-label">{requiredLabel('Passwort bestätigen')}</span>
                  <input className="field" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Noch einmal eingeben" />
                </label>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-vault-700 bg-white p-3.5">
              <legend className="flex items-center gap-2 px-1 text-sm font-bold">
                <Store className="h-4 w-4 text-vault-500" aria-hidden="true" />
                Unternehmen und Shop
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="field-label">{requiredLabel('Rechtlicher Unternehmensname')}</span>
                  <input className="field" autoComplete="organization" required value={companyLegalName} onChange={(event) => setCompanyLegalName(event.target.value)} placeholder="Muster GmbH" />
                </label>
                <label>
                  <span className="field-label">{requiredLabel('Shopname')}</span>
                  <input className="field" required value={shopName} onChange={(event) => setShopName(event.target.value)} placeholder="Muster Shop" />
                </label>
                <label className="sm:col-span-2">
                  <span className="field-label">{requiredLabel('Shop-URL')}</span>
                  <input className="field" type="url" autoComplete="url" required value={shopUrl} onChange={(event) => setShopUrl(event.target.value)} placeholder="https://shop.de" />
                </label>
                <label>
                  <span className="field-label">{requiredLabel('Branche')}</span>
                  <select className="field" required value={industry} onChange={(event) => setIndustry(event.target.value)}>
                    <option value="">Branche wählen</option>
                    {INDUSTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span className="field-label">{requiredLabel('Unternehmensgröße')}</span>
                  <select className="field" required value={companySize} onChange={(event) => setCompanySize(event.target.value)}>
                    <option value="">Größe wählen</option>
                    {COMPANY_SIZE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span className="field-label">{optionalLabel('Shop-System')}</span>
                  <select className="field" value={shopPlatform} onChange={(event) => setShopPlatform(event.target.value)}>
                    <option value="">Optional wählen</option>
                    {SHOP_PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span className="field-label">{optionalLabel('Jahresumsatz')}</span>
                  <select className="field" value={annualRevenueBand} onChange={(event) => setAnnualRevenueBand(event.target.value)}>
                    <option value="">Optional wählen</option>
                    {REVENUE_BAND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span className="field-label">{requiredLabel('Hauptmarkt')}</span>
                  <select className="field" required value={headquartersCountry} onChange={(event) => setHeadquartersCountry(event.target.value)}>
                    {COUNTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  <span className="field-label">{optionalLabel('Sitz / Stadt')}</span>
                  <input className="field" autoComplete="address-level2" value={headquartersCity} onChange={(event) => setHeadquartersCity(event.target.value)} placeholder="Berlin" />
                </label>
              </div>
            </fieldset>

            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <button className="button-primary w-full gap-2" disabled={status === 'creating'}>
              {status === 'creating' ? 'Konto wird erstellt ...' : 'Registrieren und Einrichtung starten'}
              {status !== 'creating' && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </form>
        )}
        </div>
      </section>
    </main>
  )
}
