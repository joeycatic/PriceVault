'use client'

import { CheckCircle2, LoaderCircle, Trash2, XCircle } from 'lucide-react'
import { useState, useTransition } from 'react'

type ActionResult = { ok: boolean; message: string }
type MutationIcon = 'approve' | 'reject' | 'trash'
const icons = {
  approve: CheckCircle2,
  reject: XCircle,
  trash: Trash2,
}

export function MutationButton({
  id,
  label,
  pendingLabel,
  action,
  tone = 'danger',
  icon,
  iconOnly = false,
}: {
  id: string
  label: string
  pendingLabel: string
  action: (formData: FormData) => Promise<ActionResult>
  tone?: 'danger' | 'neutral'
  icon?: MutationIcon
  iconOnly?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const VisibleIcon = pending ? LoaderCircle : icon ? icons[icon] : null
  const iconClassName = pending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'
  const toneClassName = tone === 'danger'
    ? 'text-red-700 hover:text-red-900'
    : 'text-merchant-success hover:text-vault-100'
  const iconButtonClassName = tone === 'danger'
    ? 'border-red-200 bg-red-100 text-red-800 hover:border-red-300 hover:bg-red-200 hover:text-red-950'
    : 'border-emerald-200 bg-emerald-100 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-200 hover:text-emerald-950'

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
        className={iconOnly
          ? `inline-grid h-9 w-9 place-items-center rounded-lg border shadow-sm transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${iconButtonClassName}`
          : `inline-flex items-center gap-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClassName}`}
        disabled={pending}
        aria-label={pending ? pendingLabel : label}
        title={pending ? pendingLabel : label}
      >
        {VisibleIcon && <VisibleIcon className={iconClassName} aria-hidden="true" />}
        {iconOnly ? <span className="sr-only">{pending ? pendingLabel : label}</span> : <span>{pending ? pendingLabel : label}</span>}
      </button>
      {error && <span className="mt-1 block text-xs text-red-700" role="alert">{error}</span>}
    </form>
  )
}
