'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useSupabase } from '@/components/providers/SupabaseProvider'

export default function LoginPage() {
  const router = useRouter()
  const { supabase, session } = useSupabase()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (session) router.replace('/dashboard')
  }, [router, session])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('sending')
    setError(null)
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
        <div className="mb-10 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center bg-vault-lime font-black text-vault-950">PV</span>
          <span className="text-lg font-bold tracking-tight">PriceVault</span>
        </div>

        <p className="eyebrow">Sicherer Zugang</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em]">Willkommen zurück.</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-vault-300">
          Behalte den Überblick über deine Mitbewerberpreise. Wir senden dir einen sicheren
          Anmeldelink per E-Mail.
        </p>

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
            {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
            <button className="button-primary w-full" disabled={status === 'sending'}>
              {status === 'sending' ? 'Wird gesendet …' : 'Anmeldelink senden'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

