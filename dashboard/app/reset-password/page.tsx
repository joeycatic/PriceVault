'use client'

import Link from 'next/link'
import { useState } from 'react'

import { useSupabase } from '@/components/providers/SupabaseProvider'

export default function ResetPasswordPage() {
  const { supabase } = useSupabase()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setError(null)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password/update`,
    })
    if (resetError) {
      setError('Der Link konnte nicht gesendet werden. Bitte versuche es erneut.')
      setStatus('idle')
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
          <Link href="/login" className="text-xs font-semibold text-vault-100 hover:underline">Einloggen</Link>
        </div>
        <p className="eyebrow">Nutzerkonto</p>
        <h1 className="mt-3 text-3xl font-bold">Passwort zurücksetzen</h1>
        <p className="mt-3 text-sm leading-6 text-vault-300">
          Wir senden dir einen Link, mit dem du ein neues Passwort setzen kannst.
        </p>
        {status === 'sent' ? (
          <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-5" aria-live="polite">
            <p className="font-semibold">Postfach prüfen</p>
            <p className="mt-1 text-sm leading-6 text-vault-300">Der Reset-Link wurde an {email} gesendet.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <label>
              <span className="field-label">E-Mail-Adresse</span>
              <input className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@unternehmen.de" />
            </label>
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <button className="button-primary w-full" disabled={status === 'sending'}>
              {status === 'sending' ? 'Wird gesendet ...' : 'Reset-Link senden'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
