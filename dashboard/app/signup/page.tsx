'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { useSupabase } from '@/components/providers/SupabaseProvider'

export default function SignupPage() {
  const router = useRouter()
  const { supabase } = useSupabase()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'creating' | 'sent' | 'resending'>('idle')
  const [error, setError] = useState<string | null>(null)
  const redirectTo = typeof window === 'undefined' ? undefined : `${window.location.origin}/api/auth/callback`

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }
    if (password !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.')
      return
    }

    setStatus('creating')
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: redirectTo,
      },
    })
    if (signUpError) {
      setError('Das Konto konnte nicht erstellt werden. Prüfe die Daten oder nutze Login.')
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
    <main className="grid min-h-screen place-items-center bg-vault-950 px-5 py-12">
      <section className="panel w-full max-w-md p-7 sm:p-10">
        <div className="mb-10 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3" aria-label="PriceVault Start">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-vault-100 font-black text-white">PV</span>
            <span className="text-lg font-bold">PriceVault</span>
          </Link>
          <Link href="/login" className="text-xs font-semibold text-vault-100 hover:underline">
            Einloggen
          </Link>
        </div>

        <p className="eyebrow">Nutzerkonto</p>
        <h1 className="mt-3 text-3xl font-bold">Konto erstellen</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-vault-300">
          Erstelle dein Nutzerkonto. Danach richtest du Shop, Produkte und Preisquellen ein.
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
          <form onSubmit={submit} className="mt-8 space-y-5">
            <label>
              <span className="field-label">Name</span>
              <input className="field" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Vorname Nachname" />
            </label>
            <label>
              <span className="field-label">E-Mail-Adresse</span>
              <input className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@unternehmen.de" />
            </label>
            <label>
              <span className="field-label">Passwort</span>
              <input className="field" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mindestens 8 Zeichen" />
            </label>
            <label>
              <span className="field-label">Passwort bestätigen</span>
              <input className="field" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Noch einmal eingeben" />
            </label>
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <button className="button-primary w-full" disabled={status === 'creating'}>
              {status === 'creating' ? 'Konto wird erstellt ...' : 'Registrieren'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
