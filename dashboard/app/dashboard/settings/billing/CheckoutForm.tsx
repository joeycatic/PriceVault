'use client'

import Link from 'next/link'
import { useActionState } from 'react'

export type CheckoutState = {
  message: string | null
  field?: 'vat_id' | 'billing_country' | null
  retryable?: boolean
}

const initialState: CheckoutState = { message: null }

export function CheckoutForm({
  action,
  plan,
  label,
}: {
  action: (state: CheckoutState, formData: FormData) => Promise<CheckoutState>
  plan: string
  label: string
}) {
  const [state, formAction, pending] = useActionState(action, initialState)
  return (
    <form action={formAction} className="mt-auto pt-6" aria-busy={pending}>
      <input type="hidden" name="plan" value={plan} />
      {state.message && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800" role="alert">
          <p>{state.message}</p>
          {state.field === 'vat_id' && <p className="mt-1 font-semibold">Bitte prüfe die USt-IdNr. in den Rechnungsdaten.</p>}
          {state.field === 'billing_country' && <p className="mt-1 font-semibold">Bitte prüfe das Rechnungsland.</p>}
          <Link className="mt-2 inline-block font-semibold underline" href="/dashboard/support">Support kontaktieren</Link>
        </div>
      )}
      <button className="button-primary w-full" disabled={pending}>
        {pending ? 'Checkout wird vorbereitet …' : state.retryable ? 'Erneut versuchen' : `${label} auswählen`}
      </button>
      <span className="sr-only" aria-live="polite">{pending ? 'Checkout wird geladen' : ''}</span>
    </form>
  )
}
