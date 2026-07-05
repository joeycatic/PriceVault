'use client'

import { CheckCircle2, Send, XCircle } from 'lucide-react'
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
      {result && (
        <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`} role="status">
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <p className="font-semibold">{result.message}</p>
        </div>
      )}
      <button className="button-primary gap-2" disabled={pending}>
        <Send className="h-4 w-4" aria-hidden="true" />
        {pending ? 'Wird gesendet …' : 'Anfrage senden'}
      </button>
    </form>
  )
}
