'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useSupabase } from '@/components/providers/SupabaseProvider'

type LoginMode = 'password' | 'magic'

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

    if (mode === 'password') {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        setError('E-Mail oder Passwort ist nicht korrekt.')
        setStatus('idle')
        return
      }
      router.replace('/dashboard')
      router.refresh()
      return
    }

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })
    if (authError) {
      setError('Der Anmeldelink konnte nicht gesendet werden. Bitte versuche es erneut.')
      setStatus('idle')
      return
    }
    setStatus('sent')
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute inset-y-0 left-[7%] w-px bg-vault-700/60" />
      <div className="pointer-events-none absolute left-[7%] top-16 h-16 w-1 bg-vault-lime" />
      <section className="panel relative w-full max-w-md p-7 sm:p-10">
        <div className="absolute right-0 top-0 h-2 w-20 bg-vault-lime" />
        <div className="mb-10 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3" aria-label="PriceVault Start">
            <span className="grid h-9 w-9 place-items-center bg-vault-lime font-black text-vault-950">PV</span>
            <span className="text-lg font-bold tracking-tight">PriceVault</span>
          </Link>
          <Link href="/signup" className="text-xs font-semibold text-vault-lime hover:underline">
            Konto erstellen
          </Link>
        </div>

        <p className="eyebrow">Account Login</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">Einloggen</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-vault-300">
          Melde dich mit Passwort an oder fordere einen sicheren Anmeldelink per E-Mail an.
        </p>

        <div className="mt-7 grid grid-cols-2 border border-vault-700 bg-vault-950 p-1" role="tablist" aria-label="Anmeldeart">
          {[
            ['password', 'Passwort'],
            ['magic', 'Magic Link'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={mode === value ? 'bg-vault-lime px-3 py-2 text-sm font-bold text-vault-950' : 'px-3 py-2 text-sm font-semibold text-vault-300'}
              onClick={() => {
                setMode(value as LoginMode)
                setStatus('idle')
                setError(null)
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {status === 'sent' ? (
          <div className="mt-8 border-l-2 border-vault-lime bg-vault-lime/5 p-5" aria-live="polite">
            <p className="font-semibold">Postfach prüfen</p>
            <p className="mt-1 text-sm leading-6 text-vault-300">
              Der Anmeldelink wurde an {email} gesendet.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <label>
              <span className="field-label">E-Mail-Adresse</span>
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
                <span className="field-label">Passwort</span>
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
            {errorMessage && <p className="text-sm text-red-300" role="alert">{errorMessage}</p>}
            <button className="button-primary w-full" disabled={status === 'sending'}>
              {status === 'sending'
                ? mode === 'password' ? 'Wird angemeldet ...' : 'Wird gesendet ...'
                : mode === 'password' ? 'Einloggen' : 'Anmeldelink senden'}
            </button>
            <div className="flex items-center justify-between gap-3 text-xs text-vault-400">
              <Link href="/reset-password" className="font-semibold text-vault-lime hover:underline">
                Passwort vergessen?
              </Link>
              <Link href="/signup" className="font-semibold text-vault-lime hover:underline">
                Neues Konto
              </Link>
            </div>
          </form>
        )}
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
