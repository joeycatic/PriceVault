'use client'

import { useState, useTransition } from 'react'

type Result = { ok: boolean; key?: string; message: string }

export function APIKeyCreateForm({ action }: { action: (formData: FormData) => Promise<Result> }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<Result | null>(null)

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        setResult(null)
        startTransition(async () => {
          setResult(await action(formData))
        })
      }}
    >
      <label>
        <span className="field-label">Name</span>
        <input className="field" name="name" placeholder="Warenwirtschaft Sync" required />
      </label>
      <button className="button-primary self-end" disabled={pending}>
        {pending ? 'Wird erstellt ...' : 'Key erstellen'}
      </button>
      {result && (
        <div
          className={`sm:col-span-2 border p-3 text-sm ${
            result.ok ? 'border-merchant-success/40 text-merchant-success' : 'border-red-400/50 text-red-700'
          }`}
          role={result.ok ? 'status' : 'alert'}
        >
          <p>{result.message}</p>
          {result.key && <code className="mt-2 block break-all font-mono text-vault-100">{result.key}</code>}
        </div>
      )}
    </form>
  )
}
