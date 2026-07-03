'use client'

import { useActionState } from 'react'

export type ReportActionState = {
  ok: boolean
  message: string
}

const initialState: ReportActionState = { ok: true, message: '' }

export function ReportScheduleForm({
  action,
}: {
  action: (state: ReportActionState, formData: FormData) => Promise<ReportActionState>
}) {
  const [state, formAction, pending] = useActionState(action, initialState)

  return (
    <form action={formAction} className="mt-4 space-y-3 border-b border-vault-700 pb-5">
      <label className="block">
        <span className="field-label">Name</span>
        <input className="field" name="name" placeholder="Wöchentlicher Preisreport" required />
      </label>
      <label className="block">
        <span className="field-label">Empfänger</span>
        <textarea className="field min-h-24" name="recipients" placeholder="einkauf@example.de" required />
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label>
          <span className="field-label">Rhythmus</span>
          <select className="field" name="cadence" defaultValue="weekly">
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-3 text-sm text-vault-300">
          <input name="include_csv" type="checkbox" className="h-4 w-4" />
          CSV anhängen
        </label>
      </div>
      {state.message && (
        <p className={state.ok ? 'text-sm text-merchant-success' : 'text-sm text-red-700'} role="status">
          {state.message}
        </p>
      )}
      <button className="button-primary w-full" disabled={pending}>
        {pending ? 'Wird gespeichert ...' : 'Zeitplan speichern'}
      </button>
    </form>
  )
}
