'use client'

import { useState, useTransition } from 'react'

type ActionResult = { ok: boolean; message: string }

export function MutationButton({
  id,
  label,
  pendingLabel,
  action,
  tone = 'danger',
}: {
  id: string
  label: string
  pendingLabel: string
  action: (formData: FormData) => Promise<ActionResult>
  tone?: 'danger' | 'neutral'
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        const formData = new FormData(event.currentTarget)
        startTransition(async () => {
          const next = await action(formData)
          if (!next.ok) setError(next.message)
        })
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        className={`text-xs font-semibold disabled:opacity-50 ${
          tone === 'danger'
            ? 'text-red-700 hover:text-red-900'
            : 'text-merchant-success hover:text-vault-100'
        }`}
        disabled={pending}
      >
        {pending ? pendingLabel : label}
      </button>
      {error && <span className="mt-1 block text-xs text-red-700" role="alert">{error}</span>}
    </form>
  )
}
