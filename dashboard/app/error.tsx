'use client'

import { useEffect } from 'react'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard] render failed', error)
  }, [error])

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="panel w-full max-w-lg p-7 text-center sm:p-10">
        <p className="eyebrow">Unerwarteter Fehler</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">Diese Ansicht konnte nicht geladen werden.</h1>
        <p className="mt-3 text-sm leading-6 text-vault-300">Versuche es erneut. Falls der Fehler bestehen bleibt, prüfe die Verbindung zu Supabase.</p>
        <button type="button" className="button-primary mt-7" onClick={reset}>Erneut versuchen</button>
      </section>
    </main>
  )
}
