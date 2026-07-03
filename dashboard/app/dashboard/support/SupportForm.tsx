'use client'

import { useState, useTransition } from 'react'

type Result = { ok: boolean; message: string }

export function SupportForm({ action }: { action: (formData: FormData) => Promise<Result> }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<Result | null>(null)

  return (
    <form
      id="support-form"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        setResult(null)
        const form = event.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          const next = await action(data)
          setResult(next)
          if (next.ok) form.reset()
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Bereich</span>
          <select className="field" name="category" defaultValue="general">
            <option value="scraping">Scraping und Preisquellen</option>
            <option value="billing">Abrechnung und Tarif</option>
            <option value="account">Konto und Zugriff</option>
            <option value="general">Allgemeine Anfrage</option>
          </select>
        </label>
        <label>
          <span className="field-label">Betreff</span>
          <input className="field" name="subject" required maxLength={160} />
        </label>
      </div>
      <label>
        <span className="field-label">Nachricht</span>
        <textarea className="field min-h-36" name="message" required minLength={10} maxLength={5000} />
      </label>
      {result && <p className={`text-sm ${result.ok ? 'text-merchant-success' : 'text-red-700'}`} role="status">{result.message}</p>}
      <button className="button-primary" disabled={pending}>{pending ? 'Wird gesendet …' : 'Anfrage senden'}</button>
    </form>
  )
}
