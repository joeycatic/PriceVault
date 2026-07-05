'use client'

import { Check, KeyRound, Mail } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useSupabase } from '@/components/providers/SupabaseProvider'

type LoginMode = 'password' | 'magic'
const loginTabs: Array<{ value: LoginMode; label: string; icon: LucideIcon }> = [
  { value: 'password', label: 'Passwort', icon: KeyRound },
  { value: 'magic', label: 'Magic Link', icon: Mail },
]

function requiredLabel(label: string) {
  return (
    <>
      {label} <span className="text-red-600" aria-label="Pflichtfeld">*</span>
    </>
  )
}

function loginErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login') || normalized.includes('invalid credentials')) {
    return 'E-Mail oder Passwort ist nicht korrekt. Prüfe beide Angaben oder setze dein Passwort zurück.'
  }
  if (normalized.includes('email not confirmed') || normalized.includes('not confirmed')) {
    return 'Diese E-Mail ist noch nicht bestätigt. Prüfe dein Postfach oder fordere einen neuen Link an.'
  }
  if (normalized.includes('rate') || normalized.includes('too many')) {
    return 'Zu viele Anmeldeversuche. Bitte warte kurz und versuche es erneut.'
  }
  if (normalized.includes('email')) {
    return 'Die E-Mail-Adresse wurde nicht akzeptiert. Prüfe die Schreibweise.'
  }
  return `Anmeldung fehlgeschlagen: ${message}`
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { supabase } = useSupabase()
  const [mode, setMode] = useState<LoginMode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const errorMessage = error ?? (searchParams.has('auth_error')
    ? 'Der Anmeldelink ist ungültig oder abgelaufen. Bitte fordere einen neuen an.'
    : null)

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = fragment.get('access_token')
    const refreshToken = fragment.get('refresh_token')
    if (!accessToken || !refreshToken) return

    window.history.replaceState(null, '', window.location.pathname)
    void supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError('Der Anmeldelink ist ungültig oder abgelaufen. Bitte fordere einen neuen an.')
          return
        }
        router.replace('/dashboard')
        router.refresh()
      })
  }, [router, supabase])

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/dashboard')
    })
  }, [router, supabase])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setError(null)

    if (!email.trim() || !email.includes('@')) {
      setError('Bitte gib eine gültige E-Mail-Adresse an.')
      setStatus('idle')
      return
    }

    if (mode === 'password') {
      if (!password) {
        setError('Bitte gib dein Passwort ein.')
        setStatus('idle')
        return
      }
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        setError(loginErrorMessage(authError.message))
        setStatus('idle')
        return
      }
      router.replace('/dashboard')
      router.refresh()
      return
    }

    const accountSetupNext = '/dashboard/account?complete=1'
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(accountSetupNext)}`,
      },
    })
    if (authError) {
      setError(loginErrorMessage(authError.message))
      setStatus('idle')
      return
    }
    setStatus('sent')
  }

  return (
    <main className="grid min-h-screen place-items-center bg-vault-950 px-4 py-8">
      <section className="panel grid w-full max-w-4xl overflow-hidden p-0 lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="relative overflow-hidden bg-vault-100 p-6 text-white sm:p-8">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-merchant-success/25 blur-3xl" aria-hidden="true" />
          <Link href="/" className="relative flex items-center gap-3" aria-label="PriceVault Start">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white font-black text-vault-100">PV</span>
            <span className="text-lg font-bold">PriceVault</span>
          </Link>
          <p className="relative mt-10 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Secure Login</p>
          <h1 className="relative mt-3 text-3xl font-bold tracking-[-0.04em]">Zurück in deine Preiszentrale.</h1>
          <p className="relative mt-3 text-sm leading-6 text-white/70">
            Melde dich mit Passwort an oder fordere einen sicheren Magic Link an. Danach landest du direkt in deinem Workspace.
          </p>
          <ul className="relative mt-6 space-y-2.5 text-sm text-white/75">
            {['Passwort-Login für tägliche Nutzung', 'Magic Link für schnellen Zugriff', 'Konto-Setup direkt im Dashboard abschließen'].map((item) => (
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
            <Link href="/signup" className="text-xs font-semibold text-vault-100 hover:underline">
              Konto erstellen
            </Link>
          </div>

          <p className="eyebrow">Nutzerkonto</p>
          <h2 className="mt-2 text-2xl font-bold">Einloggen</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-vault-300">
            Wähle deine bevorzugte Anmeldeart.
          </p>

          <div className="mt-5 grid grid-cols-2 rounded-lg bg-vault-800 p-1" role="tablist" aria-label="Anmeldeart">
            {loginTabs.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                className={mode === value ? 'flex items-center justify-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-vault-100 shadow-sm' : 'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-vault-500'}
                onClick={() => {
                  setMode(value)
                  setStatus('idle')
                  setError(null)
                }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {status === 'sent' ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5" aria-live="polite">
              <p className="font-semibold">Postfach prüfen</p>
              <p className="mt-1 text-sm leading-6 text-vault-300">
                Der Anmeldelink wurde an {email} gesendet.
              </p>
              <p className="mt-3 text-xs leading-5 text-vault-400">
                Falls du bisher nur Magic Links genutzt hast, kannst du nach dem Öffnen des Links in Mein Konto ein Passwort erstellen.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <fieldset className="rounded-xl border border-vault-700 bg-vault-950/70 p-3.5">
                <legend className="flex items-center gap-2 px-1 text-sm font-bold">
                  {mode === 'password' ? <KeyRound className="h-4 w-4 text-vault-500" aria-hidden="true" /> : <Mail className="h-4 w-4 text-vault-500" aria-hidden="true" />}
                  {mode === 'password' ? 'Passwort-Login' : 'Magic-Link-Login'}
                </legend>
                <div className="mt-3 space-y-3">
                  <label>
                    <span className="field-label">{requiredLabel('E-Mail-Adresse')}</span>
                    <input
                      className="field"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@unternehmen.de"
                    />
                  </label>
                  {mode === 'password' && (
                    <label>
                      <span className="field-label">{requiredLabel('Passwort')}</span>
                      <input
                        className="field"
                        type="password"
                        autoComplete="current-password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Mindestens 8 Zeichen"
                      />
                    </label>
                  )}
                </div>
              </fieldset>
              {errorMessage && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{errorMessage}</p>}
              <button className="button-primary w-full" disabled={status === 'sending'}>
                {status === 'sending'
                  ? mode === 'password' ? 'Wird angemeldet ...' : 'Wird gesendet ...'
                  : mode === 'password' ? 'Einloggen' : 'Anmeldelink senden'}
              </button>
              <div className="flex items-center justify-between gap-3 text-xs text-vault-400">
                <Link href="/reset-password" className="font-semibold text-vault-100 hover:underline">
                  Passwort vergessen?
                </Link>
                <Link href="/signup" className="font-semibold text-vault-100 hover:underline">
                  Neues Konto
                </Link>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" aria-label="Anmeldung wird geladen" />}>
      <LoginContent />
    </Suspense>
  )
}
