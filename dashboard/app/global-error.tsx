'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="de">
      <body>
        <main className="grid min-h-screen place-items-center px-5 py-12">
          <section className="w-full max-w-lg rounded-lg border border-vault-700 bg-white p-7 text-center shadow-panel sm:p-10">
            <p className="eyebrow">Unerwarteter Fehler</p>
            <h1 className="mt-3 text-3xl font-bold">PriceVault konnte nicht geladen werden.</h1>
            <p className="mt-3 text-sm leading-6 text-vault-300">
              Lade die Seite neu. Der Fehler wurde automatisch erfasst.
            </p>
            <button type="button" className="button-primary mt-7 min-h-11" onClick={reset}>
              Erneut versuchen
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}
