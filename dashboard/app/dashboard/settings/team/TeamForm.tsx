'use client'

import { CheckCircle2, Send, XCircle } from 'lucide-react'
import { useState, useTransition } from 'react'

type Result = { ok: boolean; message: string }

export function TeamInviteForm({
  action,
  disabled,
}: {
  action: (formData: FormData) => Promise<Result>
  disabled: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<Result | null>(null)

  return (
    <form
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
      <fieldset className="grid gap-3 md:grid-cols-[1fr_180px_auto]" disabled={disabled || pending}>
        <label>
          <span className="field-label">E-Mail</span>
          <input className="field" name="email" type="email" required />
        </label>
        <label>
          <span className="field-label">Rolle</span>
          <select className="field" name="role" defaultValue="member">
            <option value="member">Mitglied</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button className="button-primary self-end gap-2">
          <Send className="h-4 w-4" aria-hidden="true" />
          {pending ? 'Wird eingeladen …' : 'Einladen'}
        </button>
      </fieldset>
      {result && (
        <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`} role="status">
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <p className="font-semibold">{result.message}</p>
        </div>
      )}
    </form>
  )
}
