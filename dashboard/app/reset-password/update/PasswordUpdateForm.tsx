'use client'

import { useActionState } from 'react'

import { updateRecoveredPassword } from './actions'

const initialState = { ok: true, message: '' }

export function PasswordUpdateForm() {
  const [state, formAction, pending] = useActionState(updateRecoveredPassword, initialState)

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <label>
        <span className="field-label">Neues Passwort</span>
        <input className="field" type="password" name="password" autoComplete="new-password" required minLength={8} placeholder="Mindestens 8 Zeichen" />
      </label>
      <label>
        <span className="field-label">Passwort bestätigen</span>
        <input className="field" type="password" name="confirm_password" autoComplete="new-password" required minLength={8} placeholder="Noch einmal eingeben" />
      </label>
      {!state.ok && <p className="text-sm text-red-300" role="alert">{state.message}</p>}
      <button className="button-primary w-full" disabled={pending}>
        {pending ? 'Wird gespeichert ...' : 'Passwort speichern'}
      </button>
    </form>
  )
}
