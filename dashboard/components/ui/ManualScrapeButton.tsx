'use client'

import { useState, useTransition } from 'react'

type ActionResult = { ok: boolean; message: string }

export function ManualScrapeButton({
  action,
  competitorProductId,
  label = 'Jetzt Preise abrufen',
  pendingLabel = 'Preise werden abgerufen …',
  compact = false,
  disabled = false,
}: {
  action: (formData: FormData) => Promise<ActionResult>
  competitorProductId?: string
  label?: string
  pendingLabel?: string
  compact?: boolean
  disabled?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  return (
    <form
      className={compact ? 'inline-flex flex-col items-end gap-1' : 'space-y-2'}
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        setResult(null)
        startTransition(async () => {
          const next = await action(formData)
          setResult(next)
        })
      }}
    >
      {competitorProductId && <input type="hidden" name="competitor_product_id" value={competitorProductId} />}
      <button
        className={compact ? 'button-secondary min-h-9 px-3 py-2 text-xs' : 'button-primary w-full sm:w-auto'}
        disabled={pending || disabled}
      >
        {pending ? pendingLabel : label}
      </button>
      {result && (
        <span
          className={`block max-w-xs text-xs ${result.ok ? 'text-merchant-success' : 'text-red-700'}`}
          role={result.ok ? 'status' : 'alert'}
        >
          {result.message}
        </span>
      )}
    </form>
  )
}
